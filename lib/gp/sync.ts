import { sql } from "@/lib/db";
import { AppError } from "@/lib/api/errors";
import { gpClient, type GpActor } from "@/lib/gp/client";
import { SYNC_JOB, pullConnection, type PullResult } from "@/lib/gp/inbox";
import { runExclusive, type JobTrigger } from "@/lib/services/jobs";
import { reconcile, type EntryType } from "@/lib/services/reconciliation";
import { autoConfirmImported, ensureImportedCommitment } from "@/lib/services/commitments";
import { upsertGpCalls, type GpCapitalCall } from "@/lib/services/capital-calls";

// 받은 GP 이벤트 처리 — 동기화 (R3-4, 03 DB 설계 5장, 04 비즈니스 규칙 10-1)
// · 이벤트는 "무엇이 바뀌었다"는 신호일 뿐이다. 본문으로 데이터를 만들지 않고 GP API로 다시 읽어 반영한다 (BR-SYNC-05)
//   → 순서가 뒤바뀌거나 같은 이벤트를 두 번 처리해도 결과는 GP의 현재 상태와 같다
// · 기관 찾기: 출자자 이벤트는 그 출자자에 연결된 기관, 조합 전체 이벤트는 그 조합을 가진 모든 기관 (BR-SYNC-06)
// · 연결별 발생 순서대로. 앞 이벤트가 실패하면 같은 출자자·조합의 뒤 이벤트는 기다린다 (BR-SYNC-04)
// · 실패하면 1분 → 5분 → 30분 → 2시간 → 12시간 뒤 다시. 5번 실패하면 멈추고 관리자가 "다시 처리" (BR-SYNC-07)
// · 출자 제안 통지는 GP 제안 목록을 읽어 연동 조합 + 제안을 만든다 (R3-5, BR-PROP-03)
// · 아직 다루지 않는 이벤트(캐피탈콜·분배·총회·보고 통지 등)는 "무시" + 사유. 해당 릴리스에서 다시 맞추기로 채운다 (L22)

const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
const BATCH = 200;

// ─── GP 응답 모양 (🔗 GP lib/services/lp-portal.ts) ──────────────────────────

type GpTerms = {
  primary_purpose: string | null;
  primary_purpose_min_ratio: number | null;
  management_fee_rate: number | null;
  carry_rate: number | null;
  hurdle_rate: number | null;
};
type GpFundCore = {
  id: string;
  name: string;
  fund_type: "venture" | "new_tech";
  status: "planning" | "fundraising" | "formed" | "operating" | "dissolved" | "liquidated";
  target_amount: number;
  formation_date: string | null;
  term_years: number;
  investment_period_years: number;
};
type GpFundDetail = { fund: GpFundCore & { total_commitment_amount: number }; terms: GpTerms; my: { commitment_amount: number } };
type GpProposal = {
  id: string;
  status: "proposed" | "reviewing" | "committed" | "declined";
  proposed_amount: number | null;
  proposed_date: string;
  last_sent_at: string;
  fund: GpFundCore & { terms: GpTerms };
};
type GpLedgerEntry = { id: string; entry_type: EntryType; amount: number; entry_date: string; source: Record<string, unknown>; reversal_of_id: string | null };

const rate = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));

// ─── 조합 · 원장 맞추기 ─────────────────────────────────────────────────────

export type FundSyncResult = {
  fund_id: string | null;
  source: "member" | "proposal" | null;
  ledger?: LedgerSyncResult;
  imported?: "created" | "confirmed";
  calls?: CallsSyncResult;
};
export type CallsSyncResult = { created: number; updated: number } | { skipped: "no_active_commitment" };
export type LedgerSyncResult = { inserted: number; skipped?: "no_commitment" };

// 연동 조합 하나를 GP 현재 상태로 맞춘다.
// · 조합원이면 조합 상세 API(결성액·규약 포함), 아직 조합원이 아니면(결성 전 제안 단계) 출자 제안 목록의 조합 정보로
// · create = false 면 우리 기관에 이미 있는 조합만 갱신한다 (조합 전체 이벤트). 새 연동 조합은 첫 맞추기·조합원 가입·제안 접수 때 생긴다
// · 분야(strategy)는 LP 쪽 분류라 GP 값이 없다. 새로 만들 때 '기타'로 두고, 이후 동기화는 건드리지 않는다
export async function syncFund(orgId: string, gpId: string, gpFundId: string, opts: { create: boolean; actor?: GpActor }): Promise<FundSyncResult> {
  const gp = await gpClient(orgId, gpId, opts.actor);
  const [existing] = await sql<{ id: string }[]>`select id from funds where org_id = ${orgId} and gp_fund_id = ${gpFundId}`;
  if (!existing && !opts.create) return { fund_id: null, source: null };

  let src: { core: GpFundCore; terms: GpTerms; fundSize: number | null; source: "member" | "proposal"; myCommitment?: number } | null = null;
  try {
    const d = await gp.get<GpFundDetail>(`/funds/${gpFundId}`);
    src = {
      core: d.fund,
      terms: d.terms,
      fundSize: d.fund.total_commitment_amount > 0 ? d.fund.total_commitment_amount : null,
      source: "member",
      myCommitment: Number(d.my?.commitment_amount ?? 0),
    };
  } catch (err) {
    // 403 = 아직 조합원이 아님 (🔵 조합 단위 데이터는 조합원만). 제안 목록에서 찾는다
    if (!(err instanceof AppError && err.code === "GP_REJECTED" && err.details?.gp_status === 403)) throw err;
    const p = (await gp.get<GpProposal[]>("/proposals")).find((x) => x.fund.id === gpFundId);
    if (p) src = { core: p.fund, terms: p.fund.terms, fundSize: null, source: "proposal" };
  }
  if (!src) return { fund_id: existing?.id ?? null, source: null };

  const fundId = await upsertFund(orgId, gpId, gpFundId, src);
  if (src.source !== "member") return { fund_id: fundId, source: src.source };

  // 조합원인데 출자 건도 제안도 없으면 가져온 출자 건 (L19). 원장 사본을 읽은 뒤, 결성됐으면 결성 확인까지 바로 (BR-CMT-03)
  // GP 약정이 0이면 만들지 않는다 (GP는 명부를 취소해도 조합원 행을 남긴다)
  const [had] = await sql`select 1 from commitments where org_id = ${orgId} and fund_id = ${fundId}`;
  const commitmentId = (src.myCommitment ?? 0) > 0 ? await ensureImportedCommitment(orgId, fundId) : had ? "existing" : null;
  const ledger = await syncLedger(orgId, gpId, gpFundId, fundId, opts.actor);
  const confirmed = commitmentId ? await autoConfirmImported(orgId, fundId) : false;
  const imported = confirmed ? "confirmed" : !had && commitmentId ? "created" : undefined;
  const calls = await syncCalls(orgId, gpId, gpFundId, fundId, opts.actor);
  return { fund_id: fundId, source: src.source, ledger, ...(imported ? { imported } : {}), calls };
}

// 내게 온 GP 캐피탈콜을 회차별로 맞춘다 (R4-1, BR-CALL-01). 활성 출자 건만 (BR-CMT-07) —
// 결성 확인 전에 온 캐피탈콜은 결성 확인 직후 다시 맞출 때 들어온다
export async function syncCalls(orgId: string, gpId: string, gpFundId: string, fundId: string, actor?: GpActor): Promise<CallsSyncResult> {
  const [commitment] = await sql<{ id: string }[]>`select id from commitments where org_id = ${orgId} and fund_id = ${fundId} and status = 'active'`;
  if (!commitment) return { skipped: "no_active_commitment" };
  const gp = await gpClient(orgId, gpId, actor);
  return upsertGpCalls(orgId, commitment.id, await gp.get<GpCapitalCall[]>(`/funds/${gpFundId}/capital-calls`));
}

type FundSource = { core: GpFundCore; terms: GpTerms; fundSize: number | null };

// GP 조합 정보를 우리 조합 행에 쓴다. 분야(strategy)는 처음 만들 때만 '기타'
async function upsertFund(orgId: string, gpId: string, gpFundId: string, src: FundSource) {
  const { core, terms } = src;
  const values = {
    name: core.name,
    fund_type: core.fund_type,
    status: core.status,
    target_amount: core.target_amount,
    fund_size_amount: ["planning", "fundraising"].includes(core.status) ? null : src.fundSize,
    formation_date: core.formation_date,
    term_years: core.term_years,
    investment_period_years: core.investment_period_years,
    management_fee_rate: rate(terms.management_fee_rate),
    carry_rate: rate(terms.carry_rate),
    hurdle_rate: rate(terms.hurdle_rate),
    primary_purpose: terms.primary_purpose,
    primary_purpose_min_ratio: rate(terms.primary_purpose_min_ratio),
  };
  const [fund] = await sql<{ id: string }[]>`
    insert into funds ${sql({ ...values, org_id: orgId, gp_id: gpId, strategy: "other", data_source: "gp_api", gp_fund_id: gpFundId, last_synced_at: new Date() })}
    on conflict (org_id, gp_fund_id) do update set ${sql({ ...values, last_synced_at: new Date() })}
    returning id
  `;
  return fund.id;
}

// 내 GP 원장을 사본으로 쌓는다 (추가만, 같은 GP 행은 한 번만). 사본은 출자 건에 붙으므로 출자 건이 없으면 건너뛴다.
// 출자 건이 생길 때(선정 결재·가져온 출자 건) 다시 읽는다. 대사는 결성 확인이 끝난 출자 건의 약정·납입 (분배는 R6)
export async function syncLedger(orgId: string, gpId: string, gpFundId: string, fundId: string, actor?: GpActor): Promise<LedgerSyncResult> {
  const [commitment] = await sql<{ id: string; status: string }[]>`select id, status from commitments where org_id = ${orgId} and fund_id = ${fundId}`;
  if (!commitment) return { inserted: 0, skipped: "no_commitment" };

  const gp = await gpClient(orgId, gpId, actor);
  const { entries } = await gp.get<{ entries: GpLedgerEntry[] }>(`/funds/${gpFundId}/ledger`); // 🔗 GP lpLedger: { entries, totals }
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const changed = new Set<EntryType>();
    let inserted = 0;
    for (const e of entries) {
      const [row] = await tx`
        insert into gp_ledger_entries (org_id, commitment_id, gp_entry_id, entry_type, amount, entry_date, gp_source, gp_reversal_of_id)
        values (${orgId}, ${commitment.id}, ${e.id}, ${e.entry_type}, ${e.amount}, ${e.entry_date}, ${tx.json(e.source as never)}, ${e.reversal_of_id})
        on conflict (org_id, gp_entry_id) do nothing
        returning id
      `;
      if (row) {
        inserted++;
        changed.add(e.entry_type);
      }
    }
    // 대사: 결성 확인이 끝난 출자 건의 약정·납입 (BR-REC-01). 분배는 R6
    if (commitment.status === "active" || commitment.status === "closed") {
      for (const type of ["commitment", "contribution"] as const) if (changed.has(type)) await reconcile(t, orgId, commitment.id, type);
    }
    return { inserted };
  });
}

// ─── 출자 제안 자동 접수 (R3-5, BR-PROP-03) ──────────────────────────────────

export type ProposalIntake = {
  gp_proposal_id: string;
  fund_name: string;
  result: "created" | "updated" | "unchanged" | "skipped";
  reason?: string;
};

const kstDate = (d: string | Date) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

// GP에서 받은 출자 제안을 우리 제안으로 접수한다. gpFundId 를 주면 그 조합의 제안만
// · 새 제안: 연동 조합(결성 전이면 제안 목록의 조합 정보로) + 제안(개별 제안, gp_api, 요청액 = GP 제안 금액, 접수일 = GP 발송일)
// · 이미 있으면 갱신만: 결정 전이면 요청액을 GP 값으로. 심사 단계는 LP 것이라 건드리지 않는다
// · GP에서 이미 확약·거절로 끝난 제안은 새로 접수하지 않는다 (LP가 심사할 일이 없다) ⚠️
export async function syncProposals(orgId: string, gpId: string, opts: { gpFundId?: string; actor?: GpActor } = {}): Promise<ProposalIntake[]> {
  const gp = await gpClient(orgId, gpId, opts.actor);
  const list = (await gp.get<GpProposal[]>("/proposals")).filter((p) => !opts.gpFundId || p.fund.id === opts.gpFundId);
  const results: ProposalIntake[] = [];
  for (const gpP of list) {
    const base = { gp_proposal_id: gpP.id, fund_name: gpP.fund.name };
    const [mine] = await sql<{ id: string; status: string; requested_amount: number }[]>`
      select id, status, requested_amount from proposals where org_id = ${orgId} and gp_proposal_id = ${gpP.id}
    `;
    if (mine) {
      const open = !["selected", "rejected", "withdrawn"].includes(mine.status);
      if (open && gpP.proposed_amount && Number(mine.requested_amount) !== Number(gpP.proposed_amount)) {
        await sql`update proposals set requested_amount = ${gpP.proposed_amount} where id = ${mine.id}`;
        results.push({ ...base, result: "updated" });
      } else results.push({ ...base, result: "unchanged" });
      continue;
    }
    if (gpP.status === "committed" || gpP.status === "declined") {
      results.push({ ...base, result: "skipped", reason: "GP에서 이미 결정된 제안" });
      continue;
    }
    if (!gpP.proposed_amount) {
      results.push({ ...base, result: "skipped", reason: "GP 제안 금액이 없음" });
      continue;
    }

    // 조합: 이미 있으면 그대로(조합 정보는 조합 이벤트가 맞춘다), 없으면 제안의 조합 정보로 만든다
    const [fund] = await sql<{ id: string }[]>`select id from funds where org_id = ${orgId} and gp_fund_id = ${gpP.fund.id}`;
    const fundId = fund?.id ?? (await upsertFund(orgId, gpId, gpP.fund.id, { core: gpP.fund, terms: gpP.fund.terms, fundSize: null }));

    const created = await sql.begin(async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        insert into proposals (org_id, gp_id, fund_id, proposal_channel, requested_amount, received_date, data_source, gp_proposal_id)
        values (${orgId}, ${gpId}, ${fundId}, 'direct', ${gpP.proposed_amount}, ${kstDate(gpP.last_sent_at)}, 'gp_api', ${gpP.id})
        on conflict do nothing
        returning id
      `;
      if (!row) return false;
      await tx`
        insert into proposal_stage_history (org_id, proposal_id, from_status, to_status, note)
        values (${orgId}, ${row.id}, null, 'received', 'GP 출자 제안 자동 접수')
      `;
      return true;
    });
    results.push(created ? { ...base, result: "created" } : { ...base, result: "skipped", reason: "이 조합의 제안이 이미 있음 (BR-PROP-01)" });
  }
  return results;
}

// 연결 직후 첫 맞추기: 받은 출자 제안 + 이 기관이 조합원인 GP 조합을 모두 읽는다 (gp:link 마지막 단계, R3-4·R3-5)
// 제안을 먼저 접수한다: 조합을 먼저 읽으면 제안이 아직 없어 진행 중인 제안의 조합이 "가져온 출자 건"이 될 수 있다 (L25)
// 다시 실행해도 결과가 같다
export async function initialSync(orgId: string, gpId: string, actor?: GpActor) {
  const gp = await gpClient(orgId, gpId, actor);
  const proposals = await syncProposals(orgId, gpId, { actor });
  const funds = await gp.get<{ fund_id: string; fund_name: string }[]>("/funds");
  const results: { fund: string; result: FundSyncResult }[] = [];
  for (const f of funds) results.push({ fund: f.fund_name, result: await syncFund(orgId, gpId, f.fund_id, { create: true, actor }) });
  return { funds: results, proposals };
}

// 조합 화면의 "GP와 다시 맞추기" (BR-SYNC-09)
export async function resyncFund(orgId: string, fundId: string, actor: GpActor) {
  const [fund] = await sql<{ gp_id: string; gp_fund_id: string | null; data_source: string }[]>`
    select gp_id, gp_fund_id, data_source from funds where org_id = ${orgId} and id = ${fundId}
  `;
  if (!fund) throw new AppError(404, "NOT_FOUND", "조합을 찾을 수 없습니다");
  if (fund.data_source !== "gp_api" || !fund.gp_fund_id) {
    throw new AppError(422, "NOT_LINKED_FUND", "수기 조합은 GP와 맞출 것이 없습니다", "BR-SYNC-09");
  }
  return syncFund(orgId, fund.gp_id, fund.gp_fund_id, { create: false, actor });
}

// ─── 이벤트 처리 ────────────────────────────────────────────────────────────

type Inbound = {
  id: string;
  gp_connection_id: string;
  event_type: string;
  gp_lp_id: string | null;
  gp_fund_id: string | null;
  payload: { data?: Record<string, unknown> };
  status: "received" | "failed";
  attempts: number;
  next_attempt_at: Date | null;
};

type Outcome = { done: true } | { done: false; reason: string };

// 이벤트가 향하는 기관들 (BR-SYNC-06)
async function targetOrgs(e: Inbound) {
  if (e.gp_lp_id) {
    return sql<{ org_id: string; gp_id: string }[]>`
      select org_id, gp_id from gp_lp_links where gp_connection_id = ${e.gp_connection_id} and gp_lp_id = ${e.gp_lp_id}
    `;
  }
  return sql<{ org_id: string; gp_id: string }[]>`
    select l.org_id, l.gp_id from gp_lp_links l
    where l.gp_connection_id = ${e.gp_connection_id}
      and exists (select 1 from funds f where f.org_id = l.org_id and f.gp_fund_id = ${e.gp_fund_id})
  `;
}

async function handle(e: Inbound, orgId: string, gpId: string): Promise<Outcome> {
  const fundId = e.gp_fund_id;
  switch (e.event_type) {
    case "fund.status_changed":
    case "fund.updated":
    case "fund.terms_updated": {
      if (!fundId) return { done: false, reason: "조합 정보가 없는 이벤트" };
      const r = await syncFund(orgId, gpId, fundId, { create: false });
      return r.fund_id ? { done: true } : { done: false, reason: "우리 기관에 없는 조합" };
    }
    case "member.joined":
    case "ledger.entry_created": {
      // 조합원이 되면 조합 상세·원장을 읽을 수 있다. 처음 보는 조합이면 만든다
      if (!fundId) return { done: false, reason: "조합 정보가 없는 이벤트" };
      const r = await syncFund(orgId, gpId, fundId, { create: true });
      return r.fund_id ? { done: true } : { done: false, reason: "GP에서 이 출자자의 조합으로 찾을 수 없음" };
    }
    case "notice.sent": {
      const type = String(e.payload.data?.notice_type ?? "");
      if (type === "proposal") {
        if (!fundId) return { done: false, reason: "조합 정보가 없는 이벤트" };
        const r = await syncProposals(orgId, gpId, { gpFundId: fundId });
        if (r.length === 0) return { done: false, reason: "GP 제안 목록에 이 조합의 제안이 없음" };
        const skipped = r.filter((x) => x.result === "skipped");
        return skipped.length === r.length ? { done: false, reason: skipped.map((x) => x.reason).join(", ") } : { done: true };
      }
      if (type === "capital_call") {
        // 캐피탈콜 통지: 조합을 다시 맞추면 캐피탈콜까지 읽는다 (R4-1)
        if (!fundId) return { done: false, reason: "조합 정보가 없는 이벤트" };
        const r = await syncFund(orgId, gpId, fundId, { create: true });
        if (!r.fund_id) return { done: false, reason: "GP에서 이 출자자의 조합으로 찾을 수 없음" };
        return r.calls && "skipped" in r.calls ? { done: false, reason: "결성 확인 전인 출자 건 (확인 직후 다시 맞춤)" } : { done: true };
      }
      return { done: false, reason: `통지(${type || "알 수 없음"})는 R5~R6에서 처리 (L22)` };
    }
    default:
      return { done: false, reason: `${e.event_type} 은(는) 아직 다루지 않는 이벤트 (L22)` };
  }
}

async function processOne(e: Inbound): Promise<"processed" | "ignored"> {
  const orgs = await targetOrgs(e);
  if (orgs.length === 0) {
    await sql`update inbound_events set status = 'ignored', last_error = '연결된 기관이 없거나 우리 기관에 없는 조합', processed_at = now(), next_attempt_at = null where id = ${e.id}`;
    return "ignored";
  }
  const reasons: string[] = [];
  let anyDone = false;
  for (const o of orgs) {
    const r = await handle(e, o.org_id, o.gp_id);
    if (r.done) anyDone = true;
    else reasons.push(r.reason);
  }
  const status = anyDone ? "processed" : "ignored";
  await sql`
    update inbound_events set status = ${status}, attempts = attempts + 1, last_error = ${anyDone ? null : [...new Set(reasons)].join(" / ")},
      processed_at = now(), next_attempt_at = null
    where id = ${e.id}
  `;
  return status;
}

export type ProcessResult = { processed: number; ignored: number; failed: number; waiting: number };

// 처리할 이벤트를 발생 순서대로 한 바퀴
async function processRound(connectionIds: string[] | null): Promise<ProcessResult> {
  const events = await sql<Inbound[]>`
    select id, gp_connection_id, event_type, gp_lp_id, gp_fund_id, payload, status, attempts, next_attempt_at
    from inbound_events
    where status in ('received', 'failed')
      and (${connectionIds === null} or gp_connection_id = any(${connectionIds ?? []}::uuid[]))
    order by gp_connection_id, occurred_at, gp_event_id
    limit ${BATCH}
  `;
  const result: ProcessResult = { processed: 0, ignored: 0, failed: 0, waiting: 0 };
  const blocked = new Set<string>();
  const keysOf = (e: Inbound) => [e.gp_lp_id && `${e.gp_connection_id}:lp:${e.gp_lp_id}`, e.gp_fund_id && `${e.gp_connection_id}:fund:${e.gp_fund_id}`].filter(Boolean) as string[];

  for (const e of events) {
    const keys = keysOf(e);
    const due = e.status === "received" || (e.attempts < MAX_ATTEMPTS && e.next_attempt_at !== null && new Date(e.next_attempt_at).getTime() <= Date.now());
    if (!due || keys.some((k) => blocked.has(k))) {
      keys.forEach((k) => blocked.add(k)); // 이 이벤트가 끝나기 전에는 같은 출자자·조합의 뒤 이벤트를 처리하지 않는다
      result.waiting++;
      continue;
    }
    try {
      result[await processOne(e)]++;
    } catch (err) {
      const attempts = e.attempts + 1;
      const message = err instanceof Error ? err.message : String(err);
      const next = attempts >= MAX_ATTEMPTS ? null : new Date(Date.now() + BACKOFF_MS[attempts - 1]);
      await sql`
        update inbound_events set status = 'failed', attempts = ${attempts}, last_error = ${message.slice(0, 500)}, next_attempt_at = ${next}
        where id = ${e.id}
      `;
      keys.forEach((k) => blocked.add(k));
      result.failed++;
    }
  }
  return result;
}

// 처리할 것이 없을 때까지 몇 바퀴 (처리 중에 새로 들어온 이벤트도 놓치지 않게)
export async function processInbox(connectionIds: string[] | null = null) {
  const total: ProcessResult = { processed: 0, ignored: 0, failed: 0, waiting: 0 };
  for (let round = 0; round < 5; round++) {
    const r = await processRound(connectionIds);
    total.processed += r.processed;
    total.ignored += r.ignored;
    total.failed += r.failed;
    total.waiting = r.waiting;
    if (r.processed + r.ignored + r.failed === 0) break;
  }
  return total;
}

// 놓친 이벤트 가져오기 + 처리 (주기 작업, 관리자 "지금 가져오기", BR-SYNC-08). 한 연결이 실패해도 나머지는 계속한다
export async function pullAndProcessExclusive(connectionIds: string[], trigger: JobTrigger, actor?: GpActor) {
  const run = await runExclusive(SYNC_JOB, trigger, 300, async () => {
    const pulled: PullResult[] = [];
    for (const id of connectionIds) {
      try {
        pulled.push(await pullConnection(id, actor));
      } catch (err) {
        pulled.push({ connection: id, fetched: 0, stored: 0, duplicate: 0, before_link: 0, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { pulled, processed: await processInbox(connectionIds) };
  });
  return run.ran ? { skipped: false, ...run.result } : { skipped: true, pulled: [] as PullResult[], processed: null };
}

// 웹훅 직후(auto). 같은 잠금(gp_sync)이라 가져오기와 겹치지 않는다. 잠겨 있으면 잠금을 가진 쪽이 처리한다
export async function processExclusive(trigger: JobTrigger) {
  const run = await runExclusive(SYNC_JOB, trigger, 300, async () => ({ processed: await processInbox() }));
  return run.ran ? { skipped: false, ...run.result } : { skipped: true };
}

// 실패 이벤트 다시 처리 (관리자, BR-SYNC-07). 우리 기관 관련 이벤트만
export async function retryInboundEvent(orgId: string, eventId: string) {
  const [e] = await sql<{ status: string }[]>`
    select e.status from inbound_events e
    where e.id = ${eventId}
      and exists (
        select 1 from gp_lp_links l
        where l.org_id = ${orgId} and l.gp_connection_id = e.gp_connection_id
          and (e.gp_lp_id = l.gp_lp_id or (e.gp_lp_id is null and exists (select 1 from funds f where f.org_id = ${orgId} and f.gp_fund_id = e.gp_fund_id)))
      )
  `;
  if (!e) throw new AppError(404, "NOT_FOUND", "이벤트를 찾을 수 없습니다");
  if (e.status !== "failed") throw new AppError(409, "INVALID_STATE", "처리에 실패한 이벤트만 다시 처리할 수 있습니다", "BR-SYNC-07");
  await sql`update inbound_events set status = 'received', attempts = 0, last_error = null, next_attempt_at = null where id = ${eventId}`;
}
