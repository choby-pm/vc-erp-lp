import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { formatKRW, formatPercent } from "@/lib/format";
import { COMMITMENT_STATUSES, type CommitmentOrigin, type CommitmentStatus, type DataSource, type FundStatus, type ReconStatus, type Strategy } from "@/lib/labels";
import { reconcile } from "@/lib/services/reconciliation";
import type { CommitmentCancelInput, CommitmentConfirmInput, CommitmentListQuery } from "@/lib/schemas/commitments";

// 출자 건 · 결성 확인 (R3-6, BR-CMT-01~05, L19). 모든 함수는 기관 ID를 첫 인자로 받는다 (BR-ORG-02)
// · 출자 건은 선정 결재 승인으로 생기거나(selection), 연동 GP에 이미 약정이 있는 조합을 맞출 때 제안 없이 생긴다(imported)
// · 약정액은 출자 건에 저장하지 않는다. 결성 확인 때 우리 장부(ledger_entries)에 commitment 행으로 남긴다 (03 원칙 2)
// · 연동 조합의 약정액·결성액·결성일은 GP 값(원장 사본·조합 동기화). 수기 조합은 담당자가 결성 확인에서 한 번에 입력한다 (L25)

type Db = typeof sql;

export type CommitmentListItem = {
  id: string;
  status: CommitmentStatus;
  origin: CommitmentOrigin;
  fund_id: string;
  fund_name: string;
  fund_status: FundStatus;
  data_source: DataSource;
  strategy: Strategy;
  vintage_year: number | null;
  gp_id: string;
  gp_name: string;
  proposal_id: string | null;
  planned_amount: number | null;
  commitment_amount: number; // 우리 장부
  gp_commitment_amount: number | null; // GP 원장 사본 (연동만)
  recon_status: ReconStatus | null; // 약정 대사 (연동만)
  confirmed_date: string | null;
  created_at: Date;
};

export type CommitmentDetail = CommitmentListItem & {
  cancelled_date: string | null;
  cancel_reason: string | null;
  formation_date: string | null;
  fund_size_amount: number | null;
  max_commitment_ratio: number | null;
  formation_deadline: string | null;
  key_person_condition: string | null;
  track_min_fund_size_amount: number | null;
  closed_date: string | null;
  final_metrics: FinalMetrics | null; // 청산 확인 때 고정한 최종 성과 (BR-CLOSE-02)
};

export type FinalMetrics = {
  as_of: string;
  commitment_amount: number;
  contribution_amount: number;
  distribution_amount: number;
  dpi: number | null;
  tvpi: number | null;
  irr: number | null;
  irr_note: string | null;
};

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const num = (v: string | number | null) => (v === null ? null : Number(v));

const baseQuery = (db: Db, orgId: string) => db`
  select m.id, m.status, m.origin, m.fund_id, f.name as fund_name, f.status as fund_status, f.data_source, f.strategy, f.vintage_year,
         f.gp_id, g.name as gp_name, m.proposal_id, s.planned_amount,
         coalesce((select sum(amount) from ledger_entries e where e.commitment_id = m.id and e.entry_type = 'commitment'), 0)::bigint as commitment_amount,
         case when f.data_source = 'gp_api'
              then coalesce((select sum(amount) from gp_ledger_entries e where e.commitment_id = m.id and e.entry_type = 'commitment'), 0)::bigint end as gp_commitment_amount,
         r.recon_status, m.confirmed_date, m.created_at,
         m.cancelled_date, m.cancel_reason, f.formation_date, f.fund_size_amount, m.closed_date::text as closed_date, m.final_metrics,
         s.max_commitment_ratio, s.formation_deadline, s.key_person_condition, t.min_fund_size_amount as track_min_fund_size_amount
  from commitments m
  join funds f on f.id = m.fund_id
  join gps g on g.id = f.gp_id
  left join proposals p on p.id = m.proposal_id
  left join selection_terms s on s.proposal_id = m.proposal_id
  left join program_tracks t on t.id = p.program_track_id
  left join v_recon_current r on r.commitment_id = m.id and r.entry_type = 'commitment'
  where m.org_id = ${orgId}
`;

function normalize<T extends { max_commitment_ratio?: unknown; gp_commitment_amount: unknown }>(row: T) {
  return {
    ...row,
    gp_commitment_amount: num(row.gp_commitment_amount as string | null),
    ...("max_commitment_ratio" in row ? { max_commitment_ratio: num(row.max_commitment_ratio as string | null) } : {}),
  };
}

export async function listCommitments(orgId: string, q: CommitmentListQuery = {}) {
  const rows = await sql<CommitmentDetail[]>`
    ${baseQuery(sql, orgId)}
      ${q.status ? sql`and m.status = ${q.status}` : sql``}
    order by array_position(${sql.array([...COMMITMENT_STATUSES])}::text[], m.status), m.created_at desc
  `;
  return rows.map((r) => normalize(r) as CommitmentListItem);
}

export async function getCommitment(orgId: string, commitmentId: string, db: Db = sql): Promise<CommitmentDetail> {
  assertUuid(commitmentId, "출자 건을");
  const [row] = await db<CommitmentDetail[]>`${baseQuery(db, orgId)} and m.id = ${commitmentId}`;
  if (!row) throw notFound("출자 건을");
  return normalize(row) as CommitmentDetail;
}

// ─── 결성 확인표 (BR-CMT-02) ─────────────────────────────────────────────────

// ok: true 통과 / false 미달 / null 해당 없음·아직 판단할 값 없음
export type FormationCheckItem = { rule: string; label: string; ok: boolean | null; message: string };
export type FormationCheck = {
  ok: boolean;
  source: "gp" | "input";
  values: { commitment_amount: number | null; fund_size_amount: number | null; formation_date: string | null };
  checks: FormationCheckItem[];
};

const FORMED: FundStatus[] = ["formed", "operating"];

// 연동: GP 값(원장 사본 약정 합계, 동기화된 결성액·결성일). 수기: 입력값 (없으면 조합에 이미 있는 값으로 미리 보기)
export function buildFormationCheck(c: CommitmentDetail, input: Partial<CommitmentConfirmInput> | null): FormationCheck {
  const linked = c.data_source === "gp_api";
  const values = linked
    ? { commitment_amount: c.gp_commitment_amount, fund_size_amount: c.fund_size_amount, formation_date: c.formation_date }
    : {
        commitment_amount: input?.commitment_amount ?? null,
        fund_size_amount: input?.fund_size_amount ?? c.fund_size_amount,
        formation_date: input?.formation_date ?? c.formation_date,
      };
  const { commitment_amount: amount, fund_size_amount: size, formation_date: date } = values;
  const checks: FormationCheckItem[] = [];
  const na = (rule: string, label: string, why: string) => checks.push({ rule, label, ok: null, message: why });
  const hasTerms = c.origin === "selection" && c.planned_amount !== null;

  // 1. 조합 결성
  if (linked) {
    checks.push({
      rule: "BR-CMT-02",
      label: "조합 결성 (GP)",
      ok: FORMED.includes(c.fund_status),
      message: FORMED.includes(c.fund_status) ? `결성일 ${date ?? "-"} · 결성액 ${formatKRW(size)}` : "GP에서 아직 결성되지 않았습니다",
    });
    checks.push({
      rule: "BR-CMT-03",
      label: "GP 원장에 우리 약정",
      ok: (amount ?? 0) > 0,
      message: (amount ?? 0) > 0 ? formatKRW(amount) : "GP 원장 사본에 약정이 없습니다. GP에서 조합원 명부가 확정되면 들어옵니다",
    });
  } else {
    const closed = c.fund_status === "dissolved" || c.fund_status === "liquidated";
    const already = FORMED.includes(c.fund_status);
    const differs =
      already && input && ((input.fund_size_amount !== undefined && input.fund_size_amount !== c.fund_size_amount) || (input.formation_date !== undefined && input.formation_date !== c.formation_date));
    checks.push({
      rule: "BR-CMT-02",
      label: "조합 결성",
      ok: closed || differs ? false : already || (size !== null && date !== null) ? true : null,
      message: closed
        ? "해산·청산된 조합입니다"
        : differs
          ? `조합에 이미 저장된 결성 정보(결성일 ${c.formation_date} · 결성액 ${formatKRW(c.fund_size_amount)})와 다릅니다`
          : already
            ? `결성 완료 · 결성일 ${c.formation_date} · 결성액 ${formatKRW(c.fund_size_amount)}`
            : size !== null && date !== null
              ? "확인하면 조합도 '결성 완료'로 바뀝니다"
              : "결성일·결성액을 입력하세요",
    });
    checks.push({ rule: "BR-CMT-03", label: "약정액 입력", ok: amount ? true : null, message: amount ? formatKRW(amount) : "약정액을 입력하세요" });
  }
  if (date && date > today()) checks.push({ rule: "BR-CMT-02", label: "결성일", ok: false, message: "결성일은 오늘 이후일 수 없습니다" });

  // 2. 결성일 ≤ 결성 기한
  if (!hasTerms) na("BR-CMT-02", "결성 기한", "선정 조건이 없는 출자 건 (해당 없음)");
  else if (!date) na("BR-CMT-02", "결성 기한", `기한 ${c.formation_deadline} · 결성일 미정`);
  else checks.push({ rule: "BR-CMT-02", label: "결성 기한", ok: date <= c.formation_deadline!, message: `결성일 ${date} / 기한 ${c.formation_deadline}` });

  // 3. 결성액 ≥ 최소 결성 규모 (공고 부문에 값이 있을 때)
  if (!hasTerms || c.track_min_fund_size_amount === null) na("BR-CMT-02", "최소 결성 규모", "부문 조건 없음 (해당 없음)");
  else if (size === null) na("BR-CMT-02", "최소 결성 규모", `최소 ${formatKRW(c.track_min_fund_size_amount)} · 결성액 미정`);
  else checks.push({ rule: "BR-CMT-02", label: "최소 결성 규모", ok: size >= c.track_min_fund_size_amount, message: `결성액 ${formatKRW(size)} / 최소 ${formatKRW(c.track_min_fund_size_amount)}` });

  // 4. 약정 ÷ 결성액 ≤ 출자 비율 상한
  if (!hasTerms || c.max_commitment_ratio === null) na("BR-CMT-02", "출자 비율 상한", "상한 없음 (해당 없음)");
  else if (!amount || !size) na("BR-CMT-02", "출자 비율 상한", `상한 ${formatPercent(c.max_commitment_ratio)} · 약정액·결성액 미정`);
  else {
    const ratio = amount / size;
    checks.push({ rule: "BR-CMT-02", label: "출자 비율 상한", ok: ratio <= c.max_commitment_ratio, message: `${formatPercent(ratio, 2)} / 상한 ${formatPercent(c.max_commitment_ratio)}` });
  }

  // 5. 약정 ≤ 출자 예정액
  if (!hasTerms) na("BR-CMT-02", "출자 예정액 이내", "선정 조건이 없는 출자 건 (해당 없음)");
  else if (!amount) na("BR-CMT-02", "출자 예정액 이내", `예정액 ${formatKRW(c.planned_amount)} · 약정액 미정`);
  else checks.push({ rule: "BR-CMT-02", label: "출자 예정액 이내", ok: amount <= c.planned_amount!, message: `약정 ${formatKRW(amount)} / 예정 ${formatKRW(c.planned_amount)}` });

  // 해당 없음(null)은 통과로 본다. 단 판단할 값이 없는 1·약정 항목은 통과가 아니다
  const required = checks.slice(0, 2);
  const ok = required.every((x) => x.ok === true) && checks.every((x) => x.ok !== false);
  return { ok, source: linked ? "gp" : "input", values, checks };
}

export async function formationCheck(orgId: string, commitmentId: string, input: Partial<CommitmentConfirmInput> | null) {
  const c = await getCommitment(orgId, commitmentId);
  return buildFormationCheck(c, input);
}

// ─── 결성 확인 (BR-CMT-02~04) ────────────────────────────────────────────────

// 연동이면 먼저 GP와 다시 맞춘다 (가장 최근 결성 정보·원장으로 판단). GP가 멈춰 있으면 가진 사본으로 판단한다
export async function confirmCommitment(orgId: string, userId: string, commitmentId: string, input: CommitmentConfirmInput | null) {
  const before = await getCommitment(orgId, commitmentId);
  if (before.data_source === "gp_api") {
    const { resyncFund } = await import("@/lib/gp/sync");
    await resyncFund(orgId, before.fund_id, { type: "system" }).catch(() => null);
  } else if (!input) {
    throw new AppError(400, "VALIDATION_ERROR", "약정액·결성액·결성일을 입력하세요", "BR-CMT-03");
  }

  await sql.begin(async (tx) => {
    const t = tx as unknown as Db;
    await tx`select id from commitments where id = ${commitmentId} and org_id = ${orgId} for update`;
    const c = await getCommitment(orgId, commitmentId, t);
    if (c.status !== "awaiting_formation") throw new AppError(409, "INVALID_STATE", "결성 대기 중인 출자 건만 결성 확인할 수 있습니다", "BR-CMT-01");
    const check = buildFormationCheck(c, c.data_source === "gp_api" ? null : input);
    if (!check.ok) {
      const failed = check.checks.filter((x, i) => x.ok === false || (i < 2 && x.ok !== true));
      throw new AppError(422, "FORMATION_CHECK_FAILED", `결성 확인 조건을 채우지 못했습니다: ${failed.map((x) => x.label).join(", ")}`, "BR-CMT-02", { checks: check.checks });
    }
    const { commitment_amount, fund_size_amount, formation_date } = check.values;

    // 수기 조합: 아직 결성 전이면 조합도 결성 완료로 (L25)
    if (c.data_source === "manual" && !FORMED.includes(c.fund_status)) {
      await tx`
        update funds set status = 'formed', formation_date = ${formation_date}, fund_size_amount = ${fund_size_amount}
        where id = ${c.fund_id} and org_id = ${orgId}
      `;
    }
    await tx`
      insert into ledger_entries (org_id, commitment_id, entry_type, amount, entry_date, source_type, source_id, memo, created_by)
      values (${orgId}, ${commitmentId}, 'commitment', ${commitment_amount}, ${formation_date}, 'commitment_confirmation', ${commitmentId},
              ${c.data_source === "gp_api" ? "결성 확인 (GP 약정)" : "결성 확인"}, ${userId})
    `;
    await tx`update commitments set status = 'active', confirmed_date = ${today()} where id = ${commitmentId}`;
    if (c.data_source === "gp_api") await reconcile(t, orgId, commitmentId, "commitment");
  });
  // 연동: 활성이 된 뒤에야 캐피탈콜을 받으므로 한 번 더 맞춘다 (R4-1). GP가 멈춰 있으면 다음 동기화가 채운다
  if (before.data_source === "gp_api") {
    const { resyncFund } = await import("@/lib/gp/sync");
    await resyncFund(orgId, before.fund_id, { type: "system" }).catch(() => null);
  }
  return getCommitment(orgId, commitmentId);
}

// ─── 선정 취소 (BR-CMT-05) ───────────────────────────────────────────────────

// 결성 대기에서만, 사유 필수. 결성 기한이 지나도 자동으로 취소하지 않는다. GP에는 알리지 않는다 (받을 API가 없음)
export async function cancelCommitment(orgId: string, commitmentId: string, input: CommitmentCancelInput) {
  const c = await getCommitment(orgId, commitmentId);
  if (c.status !== "awaiting_formation") throw new AppError(409, "INVALID_STATE", "결성 대기 중인 출자 건만 선정 취소할 수 있습니다", "BR-CMT-05");
  const [row] = await sql`
    update commitments set status = 'cancelled', cancelled_date = ${today()}, cancel_reason = ${input.reason}
    where id = ${commitmentId} and org_id = ${orgId} and status = 'awaiting_formation'
    returning id
  `;
  if (!row) throw new AppError(409, "CONFLICT", "그 사이 출자 건 상태가 바뀌었습니다. 새로고침 후 다시 시도하세요");
  return getCommitment(orgId, commitmentId);
}

// ─── 가져온 출자 건 (L19, 동기화에서 부른다) ──────────────────────────────────

// GP 조합원인데 우리에게 출자 건도 제안도 없으면 가져온 출자 건을 만든다.
// 제안이 있는데 아직 선정 전이면 만들지 않는다 (선정 결재가 출자 건을 만든다)
export async function ensureImportedCommitment(orgId: string, fundId: string) {
  const [existing] = await sql<{ id: string }[]>`select id from commitments where org_id = ${orgId} and fund_id = ${fundId}`;
  if (existing) return existing.id;
  const [proposal] = await sql`select 1 from proposals where org_id = ${orgId} and fund_id = ${fundId}`;
  if (proposal) return null;
  const [row] = await sql<{ id: string }[]>`
    insert into commitments (org_id, fund_id, origin) values (${orgId}, ${fundId}, 'imported')
    on conflict (org_id, fund_id) do nothing
    returning id
  `;
  return row?.id ?? null;
}

// 가져온 출자 건은 맞추기 처리에서 결성 확인까지 바로 한다 (BR-CMT-03). 조합이 결성됐고 GP 약정이 있을 때만.
// 약정 날짜 = GP 원장에서 약정이 생긴 날(명부 확정일). 조합 결성일보다 앞설 수 있고, 과거 납입보다 약정이 먼저 오게 한다 (L32)
export async function autoConfirmImported(orgId: string, fundId: string) {
  return sql.begin(async (tx) => {
    const t = tx as unknown as Db;
    const [m] = await tx<{ id: string }[]>`
      select id from commitments where org_id = ${orgId} and fund_id = ${fundId} and origin = 'imported' and status = 'awaiting_formation' for update
    `;
    if (!m) return false;
    const c = await getCommitment(orgId, m.id, t);
    if (!FORMED.includes(c.fund_status) || !c.gp_commitment_amount || c.gp_commitment_amount <= 0) return false;
    const [first] = await tx<{ entry_date: string }[]>`
      select min(entry_date)::text as entry_date from gp_ledger_entries where commitment_id = ${m.id} and entry_type = 'commitment'
    `;
    await tx`
      insert into ledger_entries (org_id, commitment_id, entry_type, amount, entry_date, source_type, source_id, memo)
      values (${orgId}, ${m.id}, 'commitment', ${c.gp_commitment_amount}, ${first.entry_date ?? c.formation_date}, 'commitment_confirmation', ${m.id},
              '가져온 출자 건 결성 확인 (GP 약정)')
    `;
    await tx`update commitments set status = 'active', confirmed_date = ${today()} where id = ${m.id}`;
    await reconcile(t, orgId, m.id, "commitment");
    return true;
  });
}
