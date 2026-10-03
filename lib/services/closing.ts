import { sql } from "@/lib/db";
import { AppError } from "@/lib/api/errors";
import { formatKRW } from "@/lib/format";
import { getCommitment } from "@/lib/services/commitments";
import { computeMetrics, performanceInputs, todayKst } from "@/lib/services/performance";

// 청산 확인 (R6-4, BR-CLOSE-01·02). 모든 함수는 기관 ID를 첫 인자로 받는다 (BR-ORG-02)
// · 조건 (모두): ① 조합 청산 완료(연동: GP 값, 수기: 담당자가 조합 상태를 바꿈) ② 수령 대기 분배 없음
//                ③ 다 내지 않은 캐피탈콜 없음(취소 제외) ④ 확인하지 않은 대사 불일치 없음(연동만)
// · 확인하면: 청산일 기준 최종 성과(평가액 0)를 final_metrics 에 고정하고 출자 건을 closed 로 잠근다.
//   이후 납입·분배·약정 변경·보고 등 장부·문서를 더하지 않는다 (COMMITMENT_CLOSED). GP 원장 사본은 계속 받는다 (GP 기록이므로)

export type CloseCheckItem = { label: string; ok: boolean; message: string };
export type CloseCheck = { ok: boolean; checks: CloseCheckItem[] };

const ENTRY: Record<string, string> = { commitment: "약정", contribution: "납입", distribution: "분배" };

export async function closeCheck(orgId: string, commitmentId: string, db: typeof sql = sql): Promise<CloseCheck> {
  const c = await getCommitment(orgId, commitmentId, db);
  const checks: CloseCheckItem[] = [];
  checks.push({
    label: "조합 청산 완료",
    ok: c.fund_status === "liquidated",
    message: c.fund_status === "liquidated" ? "청산 완료" : c.data_source === "gp_api" ? "GP에서 아직 청산되지 않았습니다" : "조합 화면에서 상태를 '청산 완료'로 바꾸세요",
  });
  const [d] = await db<{ n: number; amount: number }[]>`
    select count(*)::int as n, coalesce(sum(amount), 0)::bigint as amount from distributions where commitment_id = ${commitmentId} and status = 'announced'
  `;
  checks.push({ label: "수령 대기 분배 없음", ok: d.n === 0, message: d.n === 0 ? "없음" : `${d.n}건 · ${formatKRW(Number(d.amount))} — 수령을 기록하세요` });
  const [u] = await db<{ n: number; left: number }[]>`
    select count(*)::int as n, coalesce(sum(c.call_amount - s.paid_amount), 0)::bigint as left
    from capital_calls c join v_capital_call_status s on s.capital_call_id = c.id
    where c.commitment_id = ${commitmentId} and c.cancelled_at is null and c.call_amount > s.paid_amount
  `;
  checks.push({ label: "미완납 캐피탈콜 없음", ok: u.n === 0, message: u.n === 0 ? "없음" : `${u.n}건 · 남은 ${formatKRW(Number(u.left))}` });
  if (c.data_source === "gp_api") {
    const mm = await db<{ entry_type: string }[]>`select entry_type from v_recon_current where commitment_id = ${commitmentId} and recon_status = 'mismatched'`;
    checks.push({ label: "확인하지 않은 대사 불일치 없음", ok: mm.length === 0, message: mm.length === 0 ? "없음" : `${mm.map((x) => ENTRY[x.entry_type]).join(", ")} 불일치 — 장부에서 맞추거나 불일치 확인을 하세요` });
  }
  return { ok: c.status === "active" && checks.every((x) => x.ok), checks };
}

// 청산 확인 (BR-CLOSE-02). 청산일: 마지막 장부 날짜 이후 · 오늘 이전 (기본 오늘)
export async function closeCommitment(orgId: string, commitmentId: string, closedDate: string | null) {
  const date = closedDate ?? todayKst();
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await tx`select id from commitments where id = ${commitmentId} and org_id = ${orgId} for update`;
    const c = await getCommitment(orgId, commitmentId, t);
    if (c.status !== "active") throw new AppError(409, "INVALID_STATE", c.status === "closed" ? "이미 청산 확인된 출자 건입니다" : "활성 출자 건만 청산 확인할 수 있습니다", "BR-CLOSE-01");
    const check = await closeCheck(orgId, commitmentId, t);
    if (!check.ok) {
      throw new AppError(422, "CLOSE_CHECK_FAILED", `청산 확인 조건을 채우지 못했습니다: ${check.checks.filter((x) => !x.ok).map((x) => x.label).join(", ")}`, "BR-CLOSE-01", { checks: check.checks });
    }
    const [last] = await tx<{ d: string | null }[]>`select max(entry_date)::text as d from ledger_entries where commitment_id = ${commitmentId}`;
    if (date > todayKst() || (last.d && date < last.d)) {
      const message = `청산일은 마지막 장부 날짜(${last.d}) 이후이고 오늘 이전이어야 합니다`;
      throw new AppError(422, "INVALID_DATE", message, "BR-CLOSE-02", { fields: { closed_date: message } });
    }
    // 최종 성과: 청산일 기준, 평가액 0 (남은 가치가 없다)
    const { sums, cashflows } = await performanceInputs(orgId, commitmentId, date);
    const m = computeMetrics(date, sums.contribution, sums.distribution, 0, cashflows);
    const final = {
      as_of: date,
      commitment_amount: sums.commitment,
      contribution_amount: sums.contribution,
      distribution_amount: sums.distribution,
      dpi: m.dpi,
      tvpi: m.tvpi,
      irr: m.irr,
      irr_note: m.irr_note,
    };
    await tx`update commitments set status = 'closed', closed_date = ${date}, final_metrics = ${tx.json(final as never)} where id = ${commitmentId}`;
  });
  return getCommitment(orgId, commitmentId);
}
