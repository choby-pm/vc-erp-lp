import { sql } from "@/lib/db";
import { formatKRW } from "@/lib/format";
import { getAlerts, type AlertGroup } from "@/lib/services/alerts";
import { getBudget, listBudgets, type BudgetDetail } from "@/lib/services/budgets";
import { getCashPlan, thisMonth, type CashPlanMonth } from "@/lib/services/cash-plan";
import { portfolioPerformance, todayKst, type MetricRow } from "@/lib/services/performance";

// 대시보드 (R5-4 주의 목록 + R7-1 숫자 · 30일 일정, 04 14장, L45). 저장하지 않고 열 때마다 계산한다
// 숫자는 새로 계산하지 않고 각 화면과 **같은 함수**를 부른다 → 예산 화면 · 성과 화면 · 자금 계획과 항상 같다 (성공 기준 6)

export type ScheduleKind = "call_due" | "meeting" | "distribution" | "formation_deadline" | "program_close" | "report_due";
export type ScheduleItem = { date: string; kind: ScheduleKind; title: string; detail: string; href: string };

export type Dashboard = {
  today: string;
  budget: BudgetDetail | null; // 올해 예산 (없으면 null)
  portfolio: MetricRow; // 성과 화면 '전체' 행과 같다
  vintages: MetricRow[]; // 성과 화면 빈티지별 행 (차트)
  cash: { month: string; this_month: CashPlanMonth | null; overdue_unpaid: number; months: CashPlanMonth[] };
  schedule: ScheduleItem[]; // 오늘 ~ 30일 뒤, 날짜순
  alerts: AlertGroup[];
};

const MEETING_TYPE: Record<string, string> = { formation: "결성총회", regular: "정기총회", extraordinary: "임시총회", dissolution: "해산총회" };
const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const quarterEnd = (d: string) => {
  const y = Number(d.slice(0, 4));
  const q = Math.floor((Number(d.slice(5, 7)) - 1) / 3);
  return new Date(Date.UTC(y, q * 3 + 3, 0)).toISOString().slice(0, 10);
};
const quarterLabel = (qe: string) => `${qe.slice(0, 4)}년 ${Math.floor(Number(qe.slice(5, 7)) / 3)}분기`;

// 30일 일정: 기한·예정일만 모은다 (이미 지난 것은 주의 목록에서)
export async function getSchedule(orgId: string, from: string = todayKst(), days = 30): Promise<ScheduleItem[]> {
  const to = addDays(from, days);
  const [calls, meetings, dists, formations, programs, active, reports] = await Promise.all([
    sql<{ id: string; fund_name: string; call_no: number; due_date: string; left: number }[]>`
      select c.id, f.name as fund_name, c.call_no, c.due_date::text, (c.call_amount - s.paid_amount)::bigint as left
      from capital_calls c join v_capital_call_status s on s.capital_call_id = c.id join commitments m on m.id = c.commitment_id join funds f on f.id = m.fund_id
      where c.org_id = ${orgId} and c.cancelled_at is null and c.call_amount > s.paid_amount and c.due_date between ${from} and ${to}
    `,
    sql<{ id: string; fund_name: string; meeting_date: string; meeting_type: string }[]>`
      select m.id, f.name as fund_name, m.meeting_date::text, m.meeting_type
      from meetings m join funds f on f.id = m.fund_id
      where m.org_id = ${orgId} and m.status = 'scheduled' and m.meeting_date between ${from} and ${to}
    `,
    sql<{ id: string; fund_name: string; distribution_no: number | null; distribution_date: string; amount: number }[]>`
      select d.id, f.name as fund_name, d.distribution_no, d.distribution_date::text, d.amount
      from distributions d join commitments m on m.id = d.commitment_id join funds f on f.id = m.fund_id
      where d.org_id = ${orgId} and d.status = 'announced' and d.distribution_date between ${from} and ${to}
    `,
    sql<{ id: string; fund_name: string; deadline: string }[]>`
      select m.id, f.name as fund_name, t.formation_deadline::text as deadline
      from commitments m join funds f on f.id = m.fund_id join selection_terms t on t.proposal_id = m.proposal_id
      where m.org_id = ${orgId} and m.status = 'awaiting_formation' and t.formation_deadline between ${from} and ${to}
    `,
    sql<{ id: string; name: string; apply_end_date: string }[]>`
      select id, name, apply_end_date::text from programs where org_id = ${orgId} and status = 'open' and apply_end_date between ${from} and ${to}
    `,
    sql<{ fund_id: string; fund_name: string; confirmed_date: string }[]>`
      select m.fund_id, f.name as fund_name, m.confirmed_date::text from commitments m join funds f on f.id = m.fund_id
      where m.org_id = ${orgId} and m.status = 'active' and m.confirmed_date is not null
    `,
    sql<{ fund_id: string; period_start: string; period_end: string }[]>`
      select fund_id, period_start::text, period_end::text from reports where org_id = ${orgId} and superseded_at is null
    `,
  ]);
  const items: ScheduleItem[] = [
    ...calls.map((c) => ({ date: c.due_date, kind: "call_due" as const, title: `${c.fund_name} · ${c.call_no}회 캐피탈콜`, detail: `납입 기한 · 남은 ${formatKRW(Number(c.left))}`, href: `/capital-calls/${c.id}` })),
    ...meetings.map((m) => ({ date: m.meeting_date, kind: "meeting" as const, title: `${m.fund_name} · ${MEETING_TYPE[m.meeting_type] ?? "총회"}`, detail: "총회일 (투표 마감)", href: `/meetings/${m.id}` })),
    ...dists.map((d) => ({ date: d.distribution_date, kind: "distribution" as const, title: `${d.fund_name} · ${d.distribution_no ?? "-"}회 분배`, detail: `분배일 · ${formatKRW(Number(d.amount))} 수령 예정`, href: `/distributions` })),
    ...formations.map((m) => ({ date: m.deadline, kind: "formation_deadline" as const, title: `${m.fund_name}`, detail: "결성 기한", href: `/commitments/${m.id}` })),
    ...programs.map((p) => ({ date: p.apply_end_date, kind: "program_close" as const, title: p.name, detail: "출자사업 접수 마감", href: `/programs/${p.id}` })),
  ];
  // 보고 기한 (L35, L11): 분기 말 + 45일. 그 분기를 덮는 보고가 아직 없고 기한이 기간 안이면
  for (const a of active) {
    for (let qe = quarterEnd(a.confirmed_date); addDays(qe, 45) <= to; qe = quarterEnd(addDays(qe, 1))) {
      const due = addDays(qe, 45);
      if (due < from) continue;
      if (!reports.some((r) => r.fund_id === a.fund_id && r.period_start <= qe && qe <= r.period_end)) {
        items.push({ date: due, kind: "report_due", title: `${a.fund_name} · ${quarterLabel(qe)} 보고`, detail: "보고 제출 기한 (분기 말 + 45일)", href: `/funds/${a.fund_id}` });
      }
    }
  }
  return items.sort((x, y) => x.date.localeCompare(y.date) || x.title.localeCompare(y.title));
}

export async function getDashboard(orgId: string, user: Parameters<typeof getAlerts>[1]): Promise<Dashboard> {
  const today = todayKst();
  const year = Number(today.slice(0, 4));
  const month = thisMonth();
  const [budgets, perf, plan, schedule, alerts] = await Promise.all([
    listBudgets(orgId),
    portfolioPerformance(orgId, today),
    getCashPlan(orgId, month, 12),
    getSchedule(orgId, today),
    getAlerts(orgId, user),
  ]);
  const thisYear = budgets.find((b) => b.budget_year === year);
  return {
    today,
    budget: thisYear ? await getBudget(orgId, thisYear.id) : null,
    portfolio: perf.total,
    vintages: perf.groups,
    cash: { month, this_month: plan.months.find((m) => m.month === month) ?? null, overdue_unpaid: plan.overdue_unpaid, months: plan.months },
    schedule,
    alerts,
  };
}
