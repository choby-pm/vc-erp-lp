import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { gpClient, type GpActor } from "@/lib/gp/client";
import type { ProposalStatus } from "@/lib/labels";

// 연동 제안의 응답을 GP에 보낸다 (R3-5, BR-PROP-06, BR-SYNC-10~12)
// · 보낼 GP 상태는 LP 상태에서 정해진다. 접수(received)는 보낼 것이 없다
// · LP 저장(트랜잭션)이 끝난 **뒤에** 보낸다. GP가 멈춰 있어도 우리 업무는 막히지 않는다
// · 보낼 것은 상태로 판단한다: gp_response_sent_at 이 비어 있으면 보낼 것 (BR-SYNC-11). 따로 보낼 목록을 두지 않는다
// · GP 응답 API는 PUT("이 상태로 만들어 달라")이라 두 번 보내도 결과가 같다 (BR-SYNC-12)
// · GP가 업무 규칙으로 거부하면(GP_REJECTED, 예: GP에서 이미 거절) LP 상태는 되돌리지 않고 경고만 남긴다.
//   다시 보내도 같은 결과라 자동으로는 다시 보내지 않는다. 제안 화면의 "GP에 다시 보내기"로는 보낼 수 있다 ⚠️

export type GpDecision = "reviewing" | "committed" | "declined";
export type GpSync =
  | { status: "not_needed" } // 수기 제안, 또는 아직 보낼 상태가 아님(접수)
  | { status: "sent"; gp_proposal_status: GpDecision }
  | { status: "pending"; message: string } // GP에 닿지 못함 → 나중에 다시 보낸다
  | { status: "rejected"; message: string }; // GP가 거부 → 경고

export function gpDecisionOf(status: ProposalStatus): GpDecision | null {
  if (status === "selected") return "committed";
  if (status === "rejected") return "declined";
  if (status === "received" || status === "withdrawn") return null;
  return "reviewing"; // screening ~ committee
}

// 제안 상태를 바꾸는 UPDATE 에 함께 넣는 SET 조각: 보낼 GP 상태가 달라지면 "보낼 것"으로 되돌린다
export function responseDueSet(to: ProposalStatus) {
  const decision = gpDecisionOf(to);
  return sql`
    gp_response_sent_at = case when data_source = 'gp_api' and gp_response_status is distinct from ${decision}::text then null else gp_response_sent_at end,
    gp_response_error_code = case when data_source = 'gp_api' and gp_response_status is distinct from ${decision}::text then null else gp_response_error_code end,
    gp_response_error = case when data_source = 'gp_api' and gp_response_status is distinct from ${decision}::text then null else gp_response_error end
  `;
}

type Target = {
  id: string;
  org_id: string;
  gp_id: string;
  status: ProposalStatus;
  data_source: "gp_api" | "manual";
  gp_proposal_id: string | null;
  decided_date: string | null;
  planned_amount: number | null;
  gp_response_sent_at: Date | null;
  gp_response_status: GpDecision | null;
};

async function loadTarget(orgId: string, proposalId: string) {
  const [p] = await sql<Target[]>`
    select p.id, p.org_id, p.gp_id, p.status, p.data_source, p.gp_proposal_id, p.decided_date, s.planned_amount,
           p.gp_response_sent_at, p.gp_response_status
    from proposals p left join selection_terms s on s.proposal_id = p.id
    where p.org_id = ${orgId} and p.id = ${proposalId}
  `;
  return p ?? null;
}

async function send(p: Target, actor?: GpActor): Promise<GpSync> {
  const decision = gpDecisionOf(p.status);
  if (p.data_source !== "gp_api" || !p.gp_proposal_id || !decision) return { status: "not_needed" };

  const body =
    decision === "committed"
      ? { decision, loc_amount: p.planned_amount, decided_date: p.decided_date }
      : decision === "declined"
        ? { decision, decided_date: p.decided_date }
        : { decision };
  try {
    const gp = await gpClient(p.org_id, p.gp_id, actor);
    await gp.put(`/proposals/${p.gp_proposal_id}/response`, body);
  } catch (err) {
    const code = err instanceof AppError ? err.code : "GP_UNAVAILABLE";
    const message = err instanceof Error ? err.message : String(err);
    await sql`
      update proposals set gp_response_attempted_at = now(), gp_response_error_code = ${code}, gp_response_error = ${message.slice(0, 500)}
      where id = ${p.id} and status = ${p.status}
    `;
    return code === "GP_REJECTED" ? { status: "rejected", message } : { status: "pending", message };
  }
  // 보내는 동안 상태가 또 바뀌었으면 기록하지 않는다 (바뀐 상태가 다음 보낼 것)
  await sql`
    update proposals set gp_response_sent_at = now(), gp_response_status = ${decision}, gp_response_attempted_at = now(),
      gp_response_error_code = null, gp_response_error = null
    where id = ${p.id} and status = ${p.status}
  `;
  return { status: "sent", gp_proposal_status: decision };
}

// 상태를 바꾼 직후 (단계 이동·탈락·선정 승인). 이미 보낸 상태면 다시 보내지 않는다
export async function sendGpResponse(orgId: string, proposalId: string, actor?: GpActor): Promise<GpSync> {
  const p = await loadTarget(orgId, proposalId);
  if (!p) return { status: "not_needed" };
  const decision = gpDecisionOf(p.status);
  if (decision && p.gp_response_sent_at && p.gp_response_status === decision) return { status: "sent", gp_proposal_status: decision };
  return send(p, actor);
}

// 제안 화면의 "GP에 다시 보내기" (BR-SYNC-11). GP가 거부했던 것도 보낸다. 이미 보냈어도 다시 보낸다 (PUT이라 결과가 같다)
export async function resendGpResponse(orgId: string, proposalId: string, actor: GpActor): Promise<GpSync> {
  assertUuid(proposalId, "출자 제안을");
  const p = await loadTarget(orgId, proposalId);
  if (!p) throw notFound("출자 제안을");
  if (p.data_source !== "gp_api") throw new AppError(409, "NOT_LINKED_PROPOSAL", "수기 제안은 GP에 보낼 것이 없습니다", "BR-PROP-06");
  if (!gpDecisionOf(p.status)) throw new AppError(409, "NOTHING_TO_SEND", "접수 단계라 GP에 보낼 응답이 없습니다. 심사를 시작하면 '검토 중'을 보냅니다", "BR-PROP-06");
  return send(p, actor);
}

export type SendPendingResult = { sent: number; pending: number; rejected: number };

// 못 보낸 응답 보내기 — 주기 작업(전체 기관)과 관리자 "못 보낸 것 지금 보내기"(우리 기관) (BR-SYNC-11)
// GP가 거부한 것은 자동으로 다시 보내지 않는다 (같은 결과). 제안 화면에서 직접 다시 보낸다
export async function sendPendingResponses(orgId: string | null, actor?: GpActor): Promise<SendPendingResult> {
  const targets = await sql<Target[]>`
    select p.id, p.org_id, p.gp_id, p.status, p.data_source, p.gp_proposal_id, p.decided_date, s.planned_amount,
           p.gp_response_sent_at, p.gp_response_status
    from proposals p left join selection_terms s on s.proposal_id = p.id
    where p.data_source = 'gp_api' and p.gp_response_sent_at is null and p.status not in ('received', 'withdrawn')
      and p.gp_response_error_code is distinct from 'GP_REJECTED'
      and (${orgId}::uuid is null or p.org_id = ${orgId}::uuid)
    order by p.updated_at
    limit 100
  `;
  const result: SendPendingResult = { sent: 0, pending: 0, rejected: 0 };
  for (const t of targets) {
    const r = await send(t, actor);
    if (r.status === "sent") result.sent++;
    else if (r.status === "pending") result.pending++;
    else if (r.status === "rejected") result.rejected++;
  }
  return result;
}

export type UnsentResponse = {
  id: string;
  fund_name: string;
  status: ProposalStatus;
  gp_response_error_code: string | null;
  gp_response_error: string | null;
  gp_response_attempted_at: Date | null;
};

// GP 연동 화면의 "보내지 못한 응답" 목록 (우리 기관)
export async function listUnsentResponses(orgId: string) {
  return sql<UnsentResponse[]>`
    select p.id, f.name as fund_name, p.status, p.gp_response_error_code, p.gp_response_error, p.gp_response_attempted_at
    from proposals p join funds f on f.id = p.fund_id
    where p.org_id = ${orgId} and p.data_source = 'gp_api' and p.gp_response_sent_at is null and p.status not in ('received', 'withdrawn')
    order by p.updated_at desc
  `;
}
