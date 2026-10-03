import { sql } from "@/lib/db";
import type { DataSource } from "@/lib/labels";

// 자금 계획 (R4-4, L29) ⚠️ 추정 방식 단순화
// 앞으로 몇 월에 얼마를 내야 할지 = 확정 + 추정
// · 확정: 받은 캐피탈콜 중 아직 송금하지 않은 금액 → 납입 기한이 있는 달. 기한이 이미 지난 미납은 "기한 지난 미납"으로 따로
// · 추정: 남은 약정(약정 − 취소되지 않은 요청 합계)을 투자 기간 끝 달까지 매달 똑같이 나눈다. 원 단위 자투리는 마지막 달
//         조회 기간 밖으로 넘어가는 몫은 "조회 기간 이후"로 합친다
// · 투자 기간이 끝난 조합의 남은 약정은 추정하지 않고 "투자 기간 이후 잔여"로 따로 (관리보수·후속 투자 때만 요청되므로)
// · 결성일·투자 기간이 없어 끝을 모르는 조합(수기 입력 누락)은 "투자 기간 정보 없음"으로 따로 — 조합 정보를 채우면 추정에 들어간다
// · 활성 출자 건만. 결성 대기 출자 건은 아직 약정이 아니라 출자 예정액 합계만 참고로 보여준다

export type CashPlanMonth = { month: string; confirmed: number; estimated: number; total: number };
export type CashPlanCommitment = {
  commitment_id: string;
  fund_name: string;
  gp_name: string;
  data_source: DataSource;
  commitment_amount: number;
  called_amount: number;
  outstanding_calls: number; // 받은 요청 중 아직 안 낸 금액
  unfunded_amount: number; // 남은 약정 (아직 요청받지 않은 약정)
  investment_period_end: string | null; // 투자 기간 끝 달 (YYYY-MM)
  monthly_estimate: number; // 추정 월 납입액 (조회 시작 달 기준)
  bucket: "estimated" | "post_period" | "unknown_period" | "none";
};
export type CashPlan = {
  from: string;
  months: CashPlanMonth[];
  overdue_unpaid: number; // 기한이 지난 미납 (확정)
  beyond_window: { confirmed: number; estimated: number }; // 조회 기간 이후
  post_period_unfunded: number; // 투자 기간 이후 잔여
  unknown_period_unfunded: number; // 투자 기간 정보가 없어 추정하지 못한 남은 약정
  awaiting_formation_planned: number; // 결성 대기 출자 건의 출자 예정액 합계 (참고)
  commitments: CashPlanCommitment[];
};

const ym = (d: string) => d.slice(0, 7);
const addMonths = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const monthDiff = (a: string, b: string) => {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
};
export const thisMonth = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 7);

export async function getCashPlan(orgId: string, from: string = thisMonth(), monthsCount = 12): Promise<CashPlan> {
  const window = Array.from({ length: monthsCount }, (_, i) => addMonths(from, i));
  const last = window[window.length - 1];
  const months = new Map(window.map((m) => [m, { month: m, confirmed: 0, estimated: 0, total: 0 }]));
  const plan: CashPlan = {
    from,
    months: [],
    overdue_unpaid: 0,
    beyond_window: { confirmed: 0, estimated: 0 },
    post_period_unfunded: 0,
    unknown_period_unfunded: 0,
    awaiting_formation_planned: 0,
    commitments: [],
  };

  const rows = await sql<
    {
      commitment_id: string;
      fund_name: string;
      gp_name: string;
      data_source: DataSource;
      commitment_amount: number;
      called_amount: number;
      unfunded_amount: number;
      formation_date: string | null;
      investment_period_years: number | null;
    }[]
  >`
    select s.commitment_id, f.name as fund_name, g.name as gp_name, f.data_source, s.commitment_amount, s.called_amount, s.unfunded_amount,
           f.formation_date, f.investment_period_years
    from v_commitment_summary s join funds f on f.id = s.fund_id join gps g on g.id = f.gp_id
    where s.org_id = ${orgId} and s.status = 'active'
    order by f.name
  `;
  const calls = await sql<{ commitment_id: string; due_date: string; outstanding: number }[]>`
    select c.commitment_id, c.due_date, (c.call_amount - s.paid_amount)::bigint as outstanding
    from capital_calls c join v_capital_call_status s on s.capital_call_id = c.id
    join commitments m on m.id = c.commitment_id
    where c.org_id = ${orgId} and c.cancelled_at is null and m.status = 'active' and c.call_amount > s.paid_amount
  `;
  const [awaiting] = await sql<{ planned: number }[]>`
    select coalesce(sum(t.planned_amount), 0)::bigint as planned
    from commitments m join selection_terms t on t.proposal_id = m.proposal_id
    where m.org_id = ${orgId} and m.status = 'awaiting_formation'
  `;
  plan.awaiting_formation_planned = Number(awaiting.planned);

  for (const r of rows) {
    // 확정: 미납 캐피탈콜 → 기한 달
    const mine = calls.filter((c) => c.commitment_id === r.commitment_id);
    let outstanding = 0;
    for (const c of mine) {
      const amount = Number(c.outstanding);
      outstanding += amount;
      const m = ym(c.due_date);
      if (m < from) plan.overdue_unpaid += amount;
      else if (m > last) plan.beyond_window.confirmed += amount;
      else months.get(m)!.confirmed += amount;
    }

    // 추정: 남은 약정을 투자 기간 끝 달까지 균등
    const unfunded = Math.max(Number(r.unfunded_amount), 0);
    const end = r.formation_date && r.investment_period_years ? addMonths(ym(r.formation_date), r.investment_period_years * 12 - 1) : null;
    let bucket: CashPlanCommitment["bucket"] = "none";
    let monthly = 0;
    if (unfunded > 0) {
      if (!end) {
        bucket = "unknown_period";
        plan.unknown_period_unfunded += unfunded;
      } else if (end < from) {
        bucket = "post_period";
        plan.post_period_unfunded += unfunded;
      } else {
        bucket = "estimated";
        const n = monthDiff(from, end) + 1;
        monthly = Math.floor(unfunded / n);
        for (let i = 0; i < n; i++) {
          const m = addMonths(from, i);
          const amount = i === n - 1 ? unfunded - monthly * (n - 1) : monthly; // 자투리는 마지막 달
          if (months.has(m)) months.get(m)!.estimated += amount;
          else plan.beyond_window.estimated += amount;
        }
      }
    }
    plan.commitments.push({
      commitment_id: r.commitment_id,
      fund_name: r.fund_name,
      gp_name: r.gp_name,
      data_source: r.data_source,
      commitment_amount: Number(r.commitment_amount),
      called_amount: Number(r.called_amount),
      outstanding_calls: outstanding,
      unfunded_amount: unfunded,
      investment_period_end: end,
      monthly_estimate: monthly,
      bucket,
    });
  }
  plan.months = window.map((m) => {
    const x = months.get(m)!;
    return { ...x, total: x.confirmed + x.estimated };
  });
  return plan;
}
