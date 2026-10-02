import type postgres from "postgres";
import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { withJosa } from "@/lib/format";
import {
  EVALUATION_STAGES,
  FINAL_PROPOSAL_STATUSES,
  PROPOSAL_STATUS_LABEL,
  REVIEW_STAGES,
  type DataSource,
  type EvaluationStage,
  type FundStatus,
  type ProposalChannel,
  type ProposalStatus,
  type Strategy,
} from "@/lib/labels";
import type { GpActor } from "@/lib/gp/client";
import { responseDueSet, sendGpResponse, type GpDecision } from "@/lib/gp/responses";
import type { LinkedProposalUpdateInput, ProposalCreateInput, ProposalListQuery, ProposalUpdateInput } from "@/lib/schemas/proposals";

// 출자 제안 접수 · 심사 단계 (R2-3, BR-PROP-01~05, BR-PRG-04). 모든 함수는 기관 ID를 첫 인자로 받는다 (BR-ORG-02)
// · 선정(selected)은 선정 결재 승인으로만 된다 (R2-4)
// · 연동 GP의 제안은 GP에서 들어오고, 심사 단계·결과는 GP에 전달한다 (R3, BR-PROP-06)

export type ProposalListItem = {
  id: string;
  status: ProposalStatus;
  proposal_channel: ProposalChannel;
  requested_amount: number;
  received_date: string;
  decided_date: string | null;
  data_source: DataSource;
  fund_id: string;
  fund_name: string;
  fund_status: FundStatus;
  strategy: Strategy;
  gp_id: string;
  gp_name: string;
  program_id: string | null;
  program_name: string | null;
  track_name: string | null;
  evaluation_count: number;
  avg_score: number | null;
};

export type StageHistory = { from_status: ProposalStatus | null; to_status: ProposalStatus; note: string | null; changed_at: Date; changed_by_name: string | null };

export type ProposalDetail = ProposalListItem & {
  memo: string | null;
  program_track_id: string | null;
  program_status: string | null;
  track_min_fund_size_amount: number | null;
  track_max_commitment_ratio: number | null;
  target_amount: number | null;
  history: StageHistory[];
  evaluable_stages: EvaluationStage[];
  pending_approval: boolean;
  has_selection_terms: boolean;
  // GP에 보낸 응답 (연동 제안만, R3-5)
  gp_response_status: GpDecision | null;
  gp_response_sent_at: Date | null;
  gp_response_attempted_at: Date | null;
  gp_response_error_code: string | null;
  gp_response_error: string | null;
};

const isFinal = (s: ProposalStatus) => (FINAL_PROPOSAL_STATUSES as readonly string[]).includes(s);
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

// 평가표 가중 점수 = Σ(점수 × 평가 당시 가중치). 제안 점수 = 평가표 평균 (BR-EVAL-05)
const listQuery = (orgId: string) => sql`
  select p.id, p.status, p.proposal_channel, p.requested_amount, p.received_date, p.decided_date, p.data_source,
         p.fund_id, f.name as fund_name, f.status as fund_status, f.strategy, p.gp_id, g.name as gp_name,
         pg.id as program_id, pg.name as program_name, t.name as track_name,
         coalesce(ev.evaluation_count, 0)::int as evaluation_count, ev.avg_score
  from proposals p
  join funds f on f.id = p.fund_id
  join gps g on g.id = p.gp_id
  left join program_tracks t on t.id = p.program_track_id
  left join programs pg on pg.id = t.program_id
  left join (
    select e.proposal_id, count(*) as evaluation_count, round(avg(e.weighted), 1)::float as avg_score
    from (select e.id, e.proposal_id, sum(s.score * s.weight_ratio) as weighted
          from evaluations e join evaluation_scores s on s.evaluation_id = e.id group by e.id) e
    group by e.proposal_id
  ) ev on ev.proposal_id = p.id
  where p.org_id = ${orgId}
`;

export async function listProposals(orgId: string, q: ProposalListQuery = {}) {
  const finals = [...FINAL_PROPOSAL_STATUSES];
  return sql<ProposalListItem[]>`
    ${listQuery(orgId)}
      ${q.status === "open" ? sql`and p.status not in ${sql(finals)}` : q.status === "closed" ? sql`and p.status in ${sql(finals)}` : q.status ? sql`and p.status = ${q.status}` : sql``}
      ${q.program_id ? sql`and pg.id = ${q.program_id}` : sql``}
      ${q.channel ? sql`and p.proposal_channel = ${q.channel}` : sql``}
    order by p.received_date desc, p.created_at desc
  `;
}

export async function getProposal(orgId: string, proposalId: string): Promise<ProposalDetail> {
  assertUuid(proposalId, "출자 제안을");
  const [p] = await sql<(ProposalListItem & Omit<ProposalDetail, keyof ProposalListItem | "history" | "evaluable_stages" | "pending_approval" | "has_selection_terms" | "track_max_commitment_ratio"> & { track_max_commitment_ratio: string | null })[]>`
    select l.*, p.memo, p.program_track_id, pg.status as program_status, t.min_fund_size_amount as track_min_fund_size_amount,
           t.max_commitment_ratio as track_max_commitment_ratio, f.target_amount,
           p.gp_response_status, p.gp_response_sent_at, p.gp_response_attempted_at, p.gp_response_error_code, p.gp_response_error
    from (${listQuery(orgId)} and p.id = ${proposalId}) l
    join proposals p on p.id = l.id
    join funds f on f.id = p.fund_id
    left join program_tracks t on t.id = p.program_track_id
    left join programs pg on pg.id = t.program_id
  `;
  if (!p) throw notFound("출자 제안을");
  const history = await sql<StageHistory[]>`
    select h.from_status, h.to_status, h.note, h.changed_at, u.name as changed_by_name
    from proposal_stage_history h left join users u on u.id = h.changed_by
    where h.proposal_id = ${proposalId} and h.org_id = ${orgId}
    order by h.changed_at, h.id
  `;
  const [pending] = await sql`select 1 from approvals where target_type = 'selection' and target_id = ${proposalId} and status = 'pending'`;
  const [terms] = await sql`select 1 from selection_terms where proposal_id = ${proposalId}`;
  return {
    ...p,
    track_max_commitment_ratio: p.track_max_commitment_ratio === null ? null : Number(p.track_max_commitment_ratio),
    history,
    evaluable_stages: evaluableStages(p.status, history),
    pending_approval: Boolean(pending),
    has_selection_terms: Boolean(terms),
  };
}

// BR-EVAL-03: 현재 단계 또는 지나온 단계만 평가할 수 있다 (건너뛴 단계는 평가하지 않는다)
function evaluableStages(status: ProposalStatus, history: StageHistory[]): EvaluationStage[] {
  const reached = new Set<string>([status, ...history.map((h) => h.to_status)]);
  return EVALUATION_STAGES.filter((s) => reached.has(s));
}

async function loadGpForManual(tx: postgres.TransactionSql, orgId: string, gpId: string) {
  const [gp] = await tx<{ linked: boolean }[]>`select gp_connection_id is not null as linked from gps where id = ${gpId} and org_id = ${orgId}`;
  if (!gp) throw new AppError(404, "NOT_FOUND", "운용사를 찾을 수 없습니다", undefined, { fields: { gp_id: "운용사를 찾을 수 없습니다" } });
  if (gp.linked) throw new AppError(409, "GP_MANAGED_FIELD", "연동된 운용사의 제안은 GP에서 자동으로 들어옵니다", "BR-PROP-03");
}

// 제안 등록 (BR-PROP-01·02, BR-PRG-04). 새 운용사·새 조합도 같은 트랜잭션에서 만든다
export async function createProposal(orgId: string, userId: string, input: ProposalCreateInput) {
  const id = await sql.begin(async (tx) => {
    // 공고형: 사업이 접수 중이고 접수일이 접수 기간 안이어야 한다
    if (input.proposal_channel === "program") {
      const [track] = await tx<{ status: string; apply_start_date: string; apply_end_date: string }[]>`
        select pg.status, pg.apply_start_date, pg.apply_end_date
        from program_tracks t join programs pg on pg.id = t.program_id
        where t.id = ${input.program_track_id!} and t.org_id = ${orgId}
      `;
      if (!track) throw new AppError(404, "NOT_FOUND", "모집 부문을 찾을 수 없습니다", undefined, { fields: { program_track_id: "모집 부문을 찾을 수 없습니다" } });
      if (track.status !== "open") throw new AppError(422, "PROGRAM_NOT_OPEN", "접수 중인 출자사업이 아닙니다", "BR-PRG-04");
      if (input.received_date < track.apply_start_date || input.received_date > track.apply_end_date) {
        throw new AppError(422, "PROGRAM_NOT_OPEN", "접수일이 출자사업 접수 기간 밖입니다", "BR-PRG-04", { fields: { received_date: "접수 기간 안의 날짜를 입력하세요" } });
      }
    }

    let fundId = input.fund_id ?? null;
    let gpId: string;
    if (fundId) {
      const [fund] = await tx<{ gp_id: string; status: FundStatus; data_source: DataSource }[]>`
        select gp_id, status, data_source from funds where id = ${fundId} and org_id = ${orgId}
      `;
      if (!fund) throw new AppError(404, "NOT_FOUND", "조합을 찾을 수 없습니다", undefined, { fields: { fund_id: "조합을 찾을 수 없습니다" } });
      if (fund.data_source === "gp_api") throw new AppError(409, "GP_MANAGED_FIELD", "연동 조합의 제안은 GP에서 자동으로 들어옵니다", "BR-PROP-03");
      if (fund.status === "dissolved" || fund.status === "liquidated") {
        throw new AppError(409, "FUND_CLOSED", "해산·청산된 조합에는 출자 제안을 등록할 수 없습니다", "BR-PROP-02");
      }
      gpId = fund.gp_id;
      const [dup] = await tx<{ id: string }[]>`select id from proposals where org_id = ${orgId} and fund_id = ${fundId}`;
      if (dup) throw new AppError(409, "DUPLICATE_PROPOSAL", "이 조합의 출자 제안이 이미 있습니다", "BR-PROP-01", { existing_proposal_id: dup.id });
    } else {
      const nf = input.new_fund!;
      if (nf.new_gp) {
        const [dupGp] = await tx`select 1 from gps where org_id = ${orgId} and lower(name) = lower(${nf.new_gp.name})`;
        if (dupGp) throw new AppError(409, "DUPLICATE_GP", "같은 이름의 운용사가 이미 있습니다. 기존 운용사를 고르세요", "BR-GP-01");
        const [gp] = await tx<{ id: string }[]>`
          insert into gps (org_id, name, gp_type, created_by) values (${orgId}, ${nf.new_gp.name}, ${nf.new_gp.gp_type}, ${userId}) returning id
        `;
        gpId = gp.id;
      } else {
        gpId = nf.gp_id!;
        await loadGpForManual(tx, orgId, gpId);
        const [dupFund] = await tx`select 1 from funds where org_id = ${orgId} and gp_id = ${gpId} and lower(name) = lower(${nf.name})`;
        if (dupFund) throw new AppError(409, "DUPLICATE_FUND", "이 운용사에 같은 이름의 조합이 이미 있습니다. 기존 조합을 고르세요", "BR-FUND-01");
      }
      const [fund] = await tx<{ id: string }[]>`
        insert into funds (org_id, gp_id, name, fund_type, strategy, status, target_amount, term_years, investment_period_years,
                           management_fee_rate, carry_rate, hurdle_rate, data_source, created_by)
        values (${orgId}, ${gpId}, ${nf.name}, ${nf.fund_type}, ${nf.strategy}, 'fundraising', ${nf.target_amount}, ${nf.term_years},
                ${nf.investment_period_years}, ${nf.management_fee_rate}, ${nf.carry_rate}, ${nf.hurdle_rate}, 'manual', ${userId})
        returning id
      `;
      fundId = fund.id;
    }

    const [p] = await tx<{ id: string }[]>`
      insert into proposals (org_id, gp_id, fund_id, proposal_channel, program_track_id, requested_amount, received_date, data_source, memo, created_by)
      values (${orgId}, ${gpId}, ${fundId}, ${input.proposal_channel}, ${input.program_track_id ?? null}, ${input.requested_amount},
              ${input.received_date}, 'manual', ${input.memo}, ${userId})
      returning id
    `;
    await tx`insert into proposal_stage_history (org_id, proposal_id, from_status, to_status, changed_by) values (${orgId}, ${p.id}, null, 'received', ${userId})`;
    return p.id;
  });
  return getProposal(orgId, id);
}

// 끝 상태가 아니고 결재 대기가 없어야 바꿀 수 있다 (BR-PROP-04, BR-APR-03)
async function loadOpen(orgId: string, proposalId: string) {
  const p = await getProposal(orgId, proposalId);
  if (isFinal(p.status)) throw new AppError(409, "PROPOSAL_CLOSED", `이미 ${withJosa(PROPOSAL_STATUS_LABEL[p.status], "으로")} 결정된 제안입니다`, "BR-PROP-04");
  if (p.pending_approval) throw new AppError(409, "APPROVAL_PENDING", "선정 결재 대기 중이라 바꿀 수 없습니다", "BR-APR-03");
  return p;
}

export async function updateProposal(orgId: string, proposalId: string, input: ProposalUpdateInput) {
  const p = await loadOpen(orgId, proposalId);
  if (p.data_source === "gp_api") throw new AppError(409, "GP_MANAGED_FIELD", "GP에서 받은 제안이라 금액·접수일을 바꿀 수 없습니다", "BR-COM-05");
  await sql`
    update proposals set requested_amount = ${input.requested_amount}, received_date = ${input.received_date}, memo = ${input.memo}
    where id = ${proposalId} and org_id = ${orgId}
  `;
  return getProposal(orgId, proposalId);
}

// 연동 제안 수정: 내부 메모와 공고 부문만 (금액·접수일은 GP 값, BR-COM-05)
// 공고 부문을 붙이면 공고형이 된다. 접수 기간은 검사하지 않는다 — GP 제안은 GP가 보낸 날 들어오므로 ⚠️ (BR-PROP-03)
// · 부문은 공고 중·심사 중인 출자사업만. 선정 조건을 쓴 뒤에는 바꿀 수 없다 (예산 연도가 사업 예산으로 정해지므로)
export async function updateLinkedProposal(orgId: string, proposalId: string, input: LinkedProposalUpdateInput) {
  const p = await loadOpen(orgId, proposalId);
  if (p.data_source !== "gp_api") throw new AppError(409, "INVALID_STATE", "수기 제안은 요청액·접수일·메모로 수정합니다");
  const trackId = input.program_track_id ?? null;
  if (trackId !== p.program_track_id) {
    if (p.has_selection_terms) {
      throw new AppError(409, "SELECTION_TERMS_EXIST", "선정 조건을 쓴 뒤에는 공고 부문을 바꿀 수 없습니다. 선정 조건의 예산 연도가 사업 예산으로 정해지기 때문입니다", "BR-PROP-03");
    }
    if (trackId) {
      assertUuid(trackId, "모집 부문을");
      const [t] = await sql<{ status: string }[]>`
        select pg.status from program_tracks t join programs pg on pg.id = t.program_id where t.id = ${trackId} and t.org_id = ${orgId}
      `;
      if (!t) throw new AppError(404, "NOT_FOUND", "모집 부문을 찾을 수 없습니다", undefined, { fields: { program_track_id: "모집 부문을 찾을 수 없습니다" } });
      if (t.status !== "open" && t.status !== "reviewing") {
        throw new AppError(422, "PROGRAM_NOT_OPEN", "공고 중이거나 심사 중인 출자사업의 부문에만 붙일 수 있습니다", "BR-PROP-03", { fields: { program_track_id: "공고 중·심사 중인 사업의 부문을 고르세요" } });
      }
    }
  }
  await sql`
    update proposals set memo = ${input.memo}, program_track_id = ${trackId}, proposal_channel = ${trackId ? "program" : "direct"}
    where id = ${proposalId} and org_id = ${orgId}
  `;
  return getProposal(orgId, proposalId);
}

// BR-PROP-04: 심사 단계는 앞으로만 간다. 건너뛸 수 있다. 선정은 결재로만
// 연동 제안이 접수에서 처음 다음 단계로 가면 GP에 '검토 중'을 보낸다 (저장 뒤, BR-PROP-06)
export async function moveStage(orgId: string, userId: string, proposalId: string, toStatus: string, note: string | null, actor?: GpActor) {
  const p = await loadOpen(orgId, proposalId);
  const from = REVIEW_STAGES.indexOf(p.status as (typeof REVIEW_STAGES)[number]);
  const to = REVIEW_STAGES.indexOf(toStatus as (typeof REVIEW_STAGES)[number]);
  if (to <= from) {
    throw new AppError(409, "INVALID_STAGE_TRANSITION", `${PROPOSAL_STATUS_LABEL[p.status]}에서 ${withJosa(PROPOSAL_STATUS_LABEL[toStatus as ProposalStatus], "으로")} 옮길 수 없습니다. 심사 단계는 앞으로만 갑니다`, "BR-PROP-04");
  }
  await changeStatus(orgId, userId, proposalId, p.status, toStatus as ProposalStatus, note, null);
  return { ...(await getProposal(orgId, proposalId)), gp_sync: await sendGpResponse(orgId, proposalId, actor) };
}

async function changeStatus(orgId: string, userId: string, proposalId: string, from: ProposalStatus, to: ProposalStatus, note: string | null, decidedDate: string | null) {
  await sql.begin(async (tx) => {
    const [row] = await tx`
      update proposals set status = ${to}, decided_date = ${decidedDate}, ${responseDueSet(to)}
      where id = ${proposalId} and org_id = ${orgId} and status = ${from}
      returning id
    `;
    if (!row) throw new AppError(409, "CONFLICT", "그 사이 제안 상태가 바뀌었습니다. 새로고침 후 다시 시도하세요");
    await tx`
      insert into proposal_stage_history (org_id, proposal_id, from_status, to_status, note, changed_by)
      values (${orgId}, ${proposalId}, ${from}, ${to}, ${note}, ${userId})
    `;
  });
}

function decidedDateOf(p: ProposalDetail, input: string | null) {
  const d = input ?? today();
  if (d < p.received_date || d > today()) {
    throw new AppError(422, "INVALID_DATE", "결정일은 접수일 이후이고 오늘 이전이어야 합니다", "BR-PROP-04", { fields: { decided_date: "결정일을 확인하세요" } });
  }
  return d;
}

// 탈락 (어느 단계에서든). 연동 제안이면 GP에 거절을 전달한다 (R3, BR-PROP-06)
export async function rejectProposal(orgId: string, userId: string, proposalId: string, input: { decided_date: string | null; note: string | null }, actor?: GpActor) {
  const p = await loadOpen(orgId, proposalId);
  await changeStatus(orgId, userId, proposalId, p.status, "rejected", input.note, decidedDateOf(p, input.decided_date));
  return { ...(await getProposal(orgId, proposalId)), gp_sync: await sendGpResponse(orgId, proposalId, actor) };
}

// 철회 (GP가 제안을 거둬들임). 수기 제안만 — 연동 제안은 GP에 해당 상태가 없다 (BR-PROP-05)
export async function withdrawProposal(orgId: string, userId: string, proposalId: string, input: { decided_date: string | null; note: string | null }) {
  const p = await loadOpen(orgId, proposalId);
  if (p.data_source === "gp_api") throw new AppError(409, "GP_MANAGED_FIELD", "연동 제안은 철회로 처리할 수 없습니다. 탈락으로 처리하세요", "BR-PROP-05");
  await changeStatus(orgId, userId, proposalId, p.status, "withdrawn", input.note, decidedDateOf(p, input.decided_date));
  return getProposal(orgId, proposalId);
}

// 조합 등록 화면 등에서 쓰는 "제안을 받을 수 있는 수기 조합" 목록 (제안이 아직 없는 조합)
export async function listFundsForProposal(orgId: string) {
  return sql<{ id: string; name: string; gp_name: string }[]>`
    select f.id, f.name, g.name as gp_name
    from funds f join gps g on g.id = f.gp_id
    where f.org_id = ${orgId} and f.data_source = 'manual' and f.status not in ('dissolved', 'liquidated')
      and not exists (select 1 from proposals p where p.fund_id = f.id)
    order by g.name, f.name
  `;
}

export async function listOpenTracks(orgId: string) {
  return sql<{ id: string; name: string; program_name: string; apply_start_date: string; apply_end_date: string }[]>`
    select t.id, t.name, pg.name as program_name, pg.apply_start_date, pg.apply_end_date
    from program_tracks t join programs pg on pg.id = t.program_id
    where t.org_id = ${orgId} and pg.status = 'open'
    order by pg.apply_start_date desc, t.created_at
  `;
}

// 연동 제안에 붙일 수 있는 공고 부문: 공고 중·심사 중인 출자사업 (R3-5, BR-PROP-03)
export async function listAttachableTracks(orgId: string) {
  return sql<{ id: string; name: string; program_name: string }[]>`
    select t.id, t.name, pg.name as program_name
    from program_tracks t join programs pg on pg.id = t.program_id
    where t.org_id = ${orgId} and pg.status in ('open', 'reviewing')
    order by pg.apply_start_date desc, t.created_at
  `;
}
