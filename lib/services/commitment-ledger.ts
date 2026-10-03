import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { formatKRW } from "@/lib/format";
import type { ReconStatus } from "@/lib/labels";
import { mismatchSince, reconcile, type EntryType } from "@/lib/services/reconciliation";
import { getCommitment } from "@/lib/services/commitments";
import type { CommitmentAdjustInput } from "@/lib/schemas/commitments";

// 출자 건 장부 · 약정 변경 · 대사 확인 (R3-6b, BR-CMT-06, BR-REC-01~07). 모든 함수는 기관 ID를 첫 인자로 받는다 (BR-ORG-02)
// · 우리 장부(ledger_entries)와 GP 원장 사본(gp_ledger_entries)을 나란히 보여준다. 둘 다 추가만 — 고칠 때는 취소 행
// · 대사는 덮어쓰지 않고 행을 추가한다. 가장 최근 행이 지금 상태 (v_recon_current)

type Db = typeof sql;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

// ─── 장부 나란히 보기 ────────────────────────────────────────────────────────

export type LedgerRow = {
  id: string;
  entry_type: EntryType;
  amount: number;
  entry_date: string;
  label: string; // 원인 (우리: 결성 확인·약정 변경·납입·분배 / GP: GP가 준 원인)
  memo: string | null;
  is_reversal: boolean;
  reversed: boolean; // 뒤에 취소 행이 붙은 행
};
export type ReconCurrent = {
  reconciliation_id: string;
  entry_type: EntryType;
  checked_at: Date;
  our_amount: number;
  gp_amount: number;
  recon_status: ReconStatus;
  resolution_memo: string | null;
  waiting: boolean; // 불일치가 생긴 지 7일 안 = 확인 대기 (BR-REC-04)
  mismatched_since: Date | null; // 지금 이어지는 불일치가 처음 생긴 시각
};
export type LedgerTotal = { entry_type: EntryType; our_amount: number; gp_amount: number | null; recon: ReconCurrent | null };
export type LedgerView = {
  ours: LedgerRow[];
  gp: LedgerRow[] | null; // 수기 조합은 대사 대상 아님 (BR-REC-07)
  totals: LedgerTotal[];
};

export const ENTRY_TYPES: EntryType[] = ["commitment", "contribution", "distribution"];
const OUR_SOURCE_LABEL: Record<string, string> = {
  commitment_confirmation: "결성 확인",
  commitment_adjustment: "약정 변경",
  payment: "납입",
  distribution: "분배",
};
const GP_SOURCE_LABEL: Record<string, string> = { formation: "명부 확정", terms_amendment: "규약 변경", capital_call: "캐피탈콜", distribution: "분배" };
const WAITING_DAYS = 7;

type GpSource = { type?: string; call_no?: number; distribution_no?: number };
const gpLabel = (s: GpSource) =>
  `${GP_SOURCE_LABEL[s.type ?? ""] ?? s.type ?? "GP"}${s.call_no ? ` ${s.call_no}회` : ""}${s.distribution_no ? ` ${s.distribution_no}회` : ""}`;

export async function getLedger(orgId: string, commitmentId: string): Promise<LedgerView> {
  const c = await getCommitment(orgId, commitmentId);
  const linked = c.data_source === "gp_api";
  const ours = await sql<(Omit<LedgerRow, "label"> & { source_type: string })[]>`
    select e.id, e.entry_type, e.amount, e.entry_date, e.source_type, e.memo, e.reversal_of_id is not null as is_reversal,
           exists (select 1 from ledger_entries r where r.reversal_of_id = e.id) as reversed
    from ledger_entries e where e.org_id = ${orgId} and e.commitment_id = ${commitmentId}
    order by e.entry_date, e.created_at
  `;
  const gp = linked
    ? await sql<(Omit<LedgerRow, "label" | "memo"> & { gp_source: GpSource })[]>`
        select g.gp_entry_id as id, g.entry_type, g.amount, g.entry_date, g.gp_source, g.gp_reversal_of_id is not null as is_reversal,
               exists (select 1 from gp_ledger_entries r where r.org_id = g.org_id and r.gp_reversal_of_id = g.gp_entry_id) as reversed
        from gp_ledger_entries g where g.org_id = ${orgId} and g.commitment_id = ${commitmentId}
        order by g.entry_date, g.synced_at
      `
    : null;
  const recon = linked
    ? await sql<Omit<ReconCurrent, "waiting">[]>`
        select reconciliation_id, entry_type, checked_at, our_amount, gp_amount, recon_status, resolution_memo
        from v_recon_current where org_id = ${orgId} and commitment_id = ${commitmentId}
      `
    : [];
  const since = new Map<EntryType, Date | null>();
  for (const r of recon) if (r.recon_status === "mismatched") since.set(r.entry_type, await mismatchSince(sql, commitmentId, r.entry_type));
  const sum = (rows: { entry_type: string; amount: number }[], t: EntryType) => rows.filter((r) => r.entry_type === t).reduce((s, r) => s + Number(r.amount), 0);

  return {
    ours: ours.map(({ source_type, ...r }) => ({ ...r, amount: Number(r.amount), label: OUR_SOURCE_LABEL[source_type] ?? source_type })),
    gp: gp?.map(({ gp_source, ...r }) => ({ ...r, amount: Number(r.amount), memo: null, label: gpLabel(gp_source) })) ?? null,
    totals: ENTRY_TYPES.map((t) => {
      const r = recon.find((x) => x.entry_type === t);
      return {
        entry_type: t,
        our_amount: sum(ours, t),
        gp_amount: gp ? sum(gp, t) : null,
        recon: r
          ? {
              ...r,
              our_amount: Number(r.our_amount),
              gp_amount: Number(r.gp_amount),
              mismatched_since: since.get(t) ?? null,
              waiting: r.recon_status === "mismatched" && Date.now() - new Date(since.get(t) ?? r.checked_at).getTime() < WAITING_DAYS * 86_400_000,
            }
          : null,
      };
    }),
  };
}

// ─── 약정 변경 (BR-CMT-06) ───────────────────────────────────────────────────

// 결성 후 약정이 바뀌면(연동: GP 원장에 새 행) 담당자가 확인해 우리 장부에 취소 행 + 새 행을 추가한다
// · 활성 출자 건만 (BR-CMT-07). 지금 살아 있는 약정 행을 모두 취소하고(변경일 날짜) 새 금액 한 행을 넣는다 → 약정 합계 = 새 금액
//   취소 행 날짜를 원래 날짜가 아닌 변경일로 두는 이유: 입력 실수 정정(BR-PAY-05)이 아니라 실제로 약정이 바뀐 것이기 때문
// · 새 금액 ≥ 이미 요청받은 금액(캐피탈콜 합계) — 남은 약정이 음수가 되지 않게. 사유 필수
// · 연동이면 같은 트랜잭션에서 약정 대사 (BR-REC-01)
export async function adjustCommitment(orgId: string, userId: string, commitmentId: string, input: CommitmentAdjustInput) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as Db;
    await tx`select id from commitments where id = ${commitmentId} and org_id = ${orgId} for update`; // BR-COM-02
    const c = await getCommitment(orgId, commitmentId, t);
    if (c.status !== "active") throw new AppError(409, "COMMITMENT_NOT_ACTIVE", "결성 확인된(활성) 출자 건만 약정을 바꿀 수 있습니다", "BR-CMT-07");
    if (input.new_amount === Number(c.commitment_amount)) {
      throw new AppError(422, "VALIDATION_ERROR", "지금 약정액과 같습니다", "BR-CMT-06", { fields: { new_amount: "지금 약정액과 다른 금액을 입력하세요" } });
    }
    const [s] = await tx<{ called_amount: number }[]>`select called_amount from v_commitment_summary where commitment_id = ${commitmentId}`;
    if (input.new_amount < Number(s.called_amount)) {
      const message = `이미 요청받은 금액(${formatKRW(Number(s.called_amount))})보다 작게 바꿀 수 없습니다`;
      throw new AppError(422, "VALIDATION_ERROR", message, "BR-CMT-06", { fields: { new_amount: message } });
    }
    const live = await tx<{ id: string; amount: number; entry_date: string }[]>`
      select e.id, e.amount, e.entry_date::text as entry_date from ledger_entries e
      where e.commitment_id = ${commitmentId} and e.entry_type = 'commitment' and e.reversal_of_id is null
        and not exists (select 1 from ledger_entries r where r.reversal_of_id = e.id)
    `;
    const first = live.reduce((d, e) => (e.entry_date < d ? e.entry_date : d), input.entry_date);
    if (input.entry_date > today() || input.entry_date < first) {
      const message = `변경일은 약정일(${first}) 이후이고 오늘 이전이어야 합니다`;
      throw new AppError(422, "INVALID_DATE", message, "BR-CMT-06", { fields: { entry_date: message } });
    }
    for (const e of live) {
      await tx`
        insert into ledger_entries (org_id, commitment_id, entry_type, amount, entry_date, source_type, source_id, reversal_of_id, memo, created_by)
        values (${orgId}, ${commitmentId}, 'commitment', ${-Number(e.amount)}, ${input.entry_date}, 'commitment_adjustment', ${commitmentId}, ${e.id},
                ${`약정 변경으로 취소: ${input.memo}`}, ${userId})
      `;
    }
    await tx`
      insert into ledger_entries (org_id, commitment_id, entry_type, amount, entry_date, source_type, source_id, memo, created_by)
      values (${orgId}, ${commitmentId}, 'commitment', ${input.new_amount}, ${input.entry_date}, 'commitment_adjustment', ${commitmentId}, ${input.memo}, ${userId})
    `;
    if (c.data_source === "gp_api") await reconcile(t, orgId, commitmentId, "commitment");
  });
  return getCommitment(orgId, commitmentId);
}

// ─── 대사 이력 · 불일치 확인 (BR-REC-05) ─────────────────────────────────────

export type ReconHistoryRow = {
  id: string;
  entry_type: EntryType;
  checked_at: Date;
  our_amount: number;
  gp_amount: number;
  recon_status: ReconStatus;
  resolution_memo: string | null;
  resolved_by_name: string | null;
};

export async function listReconciliations(orgId: string, commitmentId: string): Promise<ReconHistoryRow[]> {
  await getCommitment(orgId, commitmentId); // 다른 기관 출자 건이면 404
  const rows = await sql<ReconHistoryRow[]>`
    select r.id, r.entry_type, r.checked_at, r.our_amount, r.gp_amount, r.recon_status, r.resolution_memo, u.name as resolved_by_name
    from reconciliations r left join users u on u.id = r.resolved_by
    where r.org_id = ${orgId} and r.commitment_id = ${commitmentId}
    order by r.checked_at desc, r.id desc
  `;
  return rows.map((r) => ({ ...r, our_amount: Number(r.our_amount), gp_amount: Number(r.gp_amount) }));
}

// 불일치 확인: 담당자가 사유를 쓰고 resolved 행을 추가한다 (덮어쓰지 않는다). 숫자가 또 바뀌면 다시 판정된다 (BR-REC-02)
// 지금 상태인 불일치 행만 확인할 수 있다 (지난 행·일치·이미 확인한 것은 안 됨)
export async function resolveReconciliation(orgId: string, userId: string, reconciliationId: string, memo: string) {
  assertUuid(reconciliationId, "대사 기록을");
  return sql.begin(async (tx) => {
    const [r] = await tx<{ commitment_id: string; entry_type: EntryType; our_amount: number; gp_amount: number }[]>`
      select commitment_id, entry_type, our_amount, gp_amount from reconciliations where id = ${reconciliationId} and org_id = ${orgId}
    `;
    if (!r) throw notFound("대사 기록을");
    await tx`select id from commitments where id = ${r.commitment_id} for update`; // 동기화의 대사와 겹치지 않게
    const [cur] = await tx<{ reconciliation_id: string; recon_status: ReconStatus }[]>`
      select reconciliation_id, recon_status from v_recon_current where commitment_id = ${r.commitment_id} and entry_type = ${r.entry_type}
    `;
    if (cur.reconciliation_id !== reconciliationId) {
      throw new AppError(409, "CONFLICT", "그 사이 대사 결과가 바뀌었습니다. 새로고침 후 다시 확인하세요", "BR-REC-05");
    }
    if (cur.recon_status !== "mismatched") throw new AppError(409, "INVALID_STATE", "불일치인 대사만 확인할 수 있습니다", "BR-REC-05");
    const [row] = await tx<{ id: string }[]>`
      insert into reconciliations (org_id, commitment_id, entry_type, our_amount, gp_amount, recon_status, resolution_memo, resolved_by)
      values (${orgId}, ${r.commitment_id}, ${r.entry_type}, ${r.our_amount}, ${r.gp_amount}, 'resolved', ${memo}, ${userId})
      returning id
    `;
    return { id: row.id, commitment_id: r.commitment_id, entry_type: r.entry_type, recon_status: "resolved" as const };
  });
}
