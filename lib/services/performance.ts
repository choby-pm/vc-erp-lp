import { sql } from "@/lib/db";
import { assertUuid } from "@/lib/api/errors";
import { getCommitment } from "@/lib/services/commitments";

// 성과 지표 (R6-2, BR-PERF-01~05, L40). 모두 **우리 장부** 기준이고 저장하지 않는다 (청산 확인 때만 final_metrics 에 고정)
// · 기준일(기본 오늘) 이후 날짜의 장부 행은 뺀다 (BR-PERF-01)
// · 평가액 = 조정 평가액 (L40): 기준일 이전 가장 최근 보고(대체되지 않은 것)의 우리 몫 평가액
//          + 보고 기준일 뒤 ~ 성과 기준일 납입 − 같은 기간 분배. 보고가 없으면 0 + "평가액 없음" (BR-PERF-02). 청산된 출자 건은 0
// · DPI = 분배 ÷ 납입, RVPI = 평가액 ÷ 납입, TVPI = DPI + RVPI. 납입 0 이면 표시 안 함 (BR-PERF-03)
// · IRR = XIRR (납입 −, 분배 +, 기준일에 평가액 +). 1년 = 365일. 뉴턴법 → 실패하면 구간 나누기.
//   돈이 한쪽으로만 흐르거나 첫 납입 후 90일 미만이면 계산하지 않는다 (BR-PERF-04)

const DAY = 86_400_000;
export const todayKst = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const days = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY;

export type CashFlow = { date: string; amount: number; kind: "contribution" | "distribution" | "nav" };

// ─── XIRR ────────────────────────────────────────────────────────────────────

function npv(rate: number, flows: CashFlow[], t0: string) {
  return flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, days(t0, f.date) / 365), 0);
}
function dnpv(rate: number, flows: CashFlow[], t0: string) {
  return flows.reduce((s, f) => {
    const t = days(t0, f.date) / 365;
    return s - (t * f.amount) / Math.pow(1 + rate, t + 1);
  }, 0);
}

// 결과: 연 수익률(0.123 = 12.3%) 또는 null(계산하지 않음) + 이유
export function xirr(flows: CashFlow[]): { irr: number | null; reason: string | null } {
  const nonzero = flows.filter((f) => f.amount !== 0).sort((a, b) => a.date.localeCompare(b.date));
  if (nonzero.length < 2 || !nonzero.some((f) => f.amount > 0) || !nonzero.some((f) => f.amount < 0)) {
    return { irr: null, reason: "돈이 한쪽으로만 흘러 수익률을 계산할 수 없습니다" };
  }
  const t0 = nonzero[0].date;
  // 1) 뉴턴법
  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(r, nonzero, t0);
    const d = dnpv(r, nonzero, t0);
    if (!Number.isFinite(f) || !Number.isFinite(d) || d === 0) break;
    const next = r - f / d;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-10) return { irr: next, reason: null };
    r = next;
  }
  // 2) 구간 나누기: -99%~1000% 를 촘촘히 훑어 부호가 바뀌는 구간을 찾는다 (0%에 가장 가까운 구간). 양 끝만 보면 중간의 답을 놓친다
  const grid = [-0.99, -0.95, -0.9, -0.8, -0.7, -0.6, -0.5, -0.4, -0.3, -0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10];
  const vals = grid.map((g) => npv(g, nonzero, t0));
  const brackets: [number, number][] = [];
  for (let i = 0; i + 1 < grid.length; i++) {
    if (Number.isFinite(vals[i]) && Number.isFinite(vals[i + 1]) && Math.sign(vals[i]) !== Math.sign(vals[i + 1])) brackets.push([grid[i], grid[i + 1]]);
  }
  if (brackets.length === 0) {
    return { irr: null, reason: "-99%~1000% 안에서 수익률을 찾지 못했습니다 (평가액이 없거나 손실이 매우 큰 현금흐름)" };
  }
  brackets.sort((x, y) => Math.abs(x[0] + x[1]) - Math.abs(y[0] + y[1]));
  let [lo, hi] = brackets[0];
  let flo = npv(lo, nonzero, t0);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid, nonzero, t0);
    if (Math.abs(fm) < 1e-6 || hi - lo < 1e-10) return { irr: mid, reason: null };
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  return { irr: (lo + hi) / 2, reason: null };
}

// ─── 출자 건 하나 ────────────────────────────────────────────────────────────

export type Performance = {
  as_of: string;
  commitment_amount: number;
  contribution_amount: number;
  distribution_amount: number;
  nav: {
    amount: number; // 조정 평가액
    missing: boolean; // 보고가 없어 0으로 계산 (BR-PERF-02)
    report_id: string | null;
    report_period_end: string | null;
    reported_amount: number | null; // 보고의 우리 몫 평가액
    contributions_after: number; // 보고 기준일 뒤 납입 (더함)
    distributions_after: number; // 보고 기준일 뒤 분배 (뺌)
  };
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
  irr: number | null;
  irr_note: string | null;
  cashflows: CashFlow[]; // IRR 근거 (기준일 평가액 포함)
};

type Sums = { commitment: number; contribution: number; distribution: number };

// 장부 합계·현금흐름·평가액을 읽어 성과를 계산한다. 포트폴리오 합계(R6-3)도 이 재료를 합쳐 쓴다
export async function performanceInputs(orgId: string, commitmentId: string, asOf: string) {
  const [s] = await sql<Sums[]>`
    select coalesce(sum(amount) filter (where entry_type = 'commitment'), 0)::bigint as commitment,
           coalesce(sum(amount) filter (where entry_type = 'contribution'), 0)::bigint as contribution,
           coalesce(sum(amount) filter (where entry_type = 'distribution'), 0)::bigint as distribution
    from ledger_entries where org_id = ${orgId} and commitment_id = ${commitmentId} and entry_date <= ${asOf}
  `;
  // 같은 날짜끼리 묶은 현금흐름 (취소 행 포함, 순액)
  const flows = await sql<{ date: string; kind: "contribution" | "distribution"; amount: number }[]>`
    select flow_date::text as date, entry_type as kind, sum(flow_amount)::bigint as amount
    from v_cashflows where org_id = ${orgId} and commitment_id = ${commitmentId} and flow_date <= ${asOf}
    group by flow_date, entry_type having sum(flow_amount) <> 0
    order by flow_date
  `;
  const [m] = await sql<{ status: string; fund_id: string }[]>`select status, fund_id from commitments where id = ${commitmentId}`;
  const [r] = await sql<{ id: string; period_end: string; nav_amount: number }[]>`
    select id, period_end::text, nav_amount from reports
    where org_id = ${orgId} and fund_id = ${m.fund_id} and superseded_at is null and nav_amount is not null and period_end <= ${asOf}
    order by period_end desc, received_date desc nulls last limit 1
  `;
  let nav: Performance["nav"] = { amount: 0, missing: !r, report_id: r?.id ?? null, report_period_end: r?.period_end ?? null, reported_amount: r ? Number(r.nav_amount) : null, contributions_after: 0, distributions_after: 0 };
  if (m.status === "closed") nav = { ...nav, amount: 0, missing: false };
  else if (r) {
    const after = flows.filter((f) => f.date > r.period_end);
    const contributions_after = -after.filter((f) => f.kind === "contribution").reduce((x, f) => x + Number(f.amount), 0);
    const distributions_after = after.filter((f) => f.kind === "distribution").reduce((x, f) => x + Number(f.amount), 0);
    nav = { ...nav, amount: Math.max(Number(r.nav_amount) + contributions_after - distributions_after, 0), contributions_after, distributions_after };
  }
  const cashflows: CashFlow[] = flows.map((f) => ({ date: f.date, kind: f.kind, amount: Number(f.amount) }));
  return { sums: { commitment: Number(s.commitment), contribution: Number(s.contribution), distribution: Number(s.distribution) }, nav, cashflows };
}

export function computeMetrics(asOf: string, contribution: number, distribution: number, navAmount: number, cashflows: CashFlow[]) {
  const ratio = (x: number) => (contribution > 0 ? Number((x / contribution).toFixed(4)) : null);
  const dpi = ratio(distribution);
  const rvpi = ratio(navAmount);
  // TVPI = DPI + RVPI 이지만, 반올림한 두 값을 더하면 넷째 자리가 어긋날 수 있어 금액으로 바로 나눈다 (R7-5 숫자 점검에서 발견)
  const tvpi = ratio(distribution + navAmount);
  const flows = navAmount > 0 ? [...cashflows, { date: asOf, kind: "nav" as const, amount: navAmount }] : cashflows;
  const firstPay = cashflows.find((f) => f.kind === "contribution")?.date;
  let irr: number | null = null;
  let irr_note: string | null = null;
  if (!firstPay) irr_note = "납입이 없어 계산하지 않습니다";
  else if (days(firstPay, asOf) < 90) irr_note = "첫 납입 후 90일이 안 돼 계산하지 않습니다 (연 환산 값이 비정상적으로 커짐)";
  else {
    const x = xirr(flows);
    irr = x.irr === null ? null : Number(x.irr.toFixed(6));
    irr_note = x.reason;
  }
  return { dpi, rvpi, tvpi, irr, irr_note, flows };
}

export async function commitmentPerformance(orgId: string, commitmentId: string, asOf: string = todayKst()): Promise<Performance> {
  assertUuid(commitmentId, "출자 건을");
  await getCommitment(orgId, commitmentId); // 다른 기관이면 404
  const { sums, nav, cashflows } = await performanceInputs(orgId, commitmentId, asOf);
  const m = computeMetrics(asOf, sums.contribution, sums.distribution, nav.amount, cashflows);
  return {
    as_of: asOf,
    commitment_amount: sums.commitment,
    contribution_amount: sums.contribution,
    distribution_amount: sums.distribution,
    nav,
    dpi: m.dpi,
    rvpi: m.rvpi,
    tvpi: m.tvpi,
    irr: m.irr,
    irr_note: m.irr_note,
    cashflows: m.flows,
  };
}

// ─── 포트폴리오 (R6-3, BR-PERF-05·06, L42) ───────────────────────────────────

export type GroupBy = "vintage" | "strategy" | "gp" | "source";
export type MetricRow = {
  key: string;
  label: string;
  count: number;
  nav_missing_count: number; // 평가액 보고가 없어 0으로 계산한 출자 건 수
  commitment_amount: number;
  contribution_amount: number;
  distribution_amount: number;
  nav_amount: number;
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
  irr: number | null;
  irr_note: string | null;
};
export type PortfolioRow = MetricRow & { commitment_id: string; fund_name: string; gp_name: string; vintage_year: number | null; strategy: string; data_source: string };
export type Portfolio = { as_of: string; group_by: GroupBy; total: MetricRow; groups: MetricRow[]; commitments: PortfolioRow[] };

const STRATEGY: Record<string, string> = { early: "초기", growth: "성장", secondary: "세컨더리", overseas: "해외", other: "기타" };

type Piece = { contribution: number; distribution: number; commitment: number; nav: number; navMissing: boolean; flows: CashFlow[] };

// 여러 출자 건 합치기: 배수는 금액 합계로 다시 나누고(평균의 평균이 아님), IRR은 현금흐름을 모두 합쳐 한 번 (BR-PERF-05)
function aggregate(key: string, label: string, asOf: string, pieces: Piece[]): MetricRow {
  const sum = (k: "contribution" | "distribution" | "commitment" | "nav") => pieces.reduce((s, p) => s + p[k], 0);
  const flows = pieces.flatMap((p) => p.flows);
  const m = computeMetrics(asOf, sum("contribution"), sum("distribution"), sum("nav"), flows);
  return {
    key,
    label,
    count: pieces.length,
    nav_missing_count: pieces.filter((p) => p.navMissing && p.contribution > 0).length, // 납입이 없으면 성과에 영향이 없어 세지 않는다
    commitment_amount: sum("commitment"),
    contribution_amount: sum("contribution"),
    distribution_amount: sum("distribution"),
    nav_amount: sum("nav"),
    dpi: m.dpi,
    rvpi: m.rvpi,
    tvpi: m.tvpi,
    irr: m.irr,
    irr_note: m.irr_note,
  };
}

// 결성 대기·취소된 출자 건은 뺀다 (BR-PERF-06). 기준일까지 장부 기록이 하나도 없는 출자 건도 뺀다
export async function portfolioPerformance(orgId: string, asOf: string = todayKst(), groupBy: GroupBy = "vintage"): Promise<Portfolio> {
  const list = await sql<{ id: string; fund_name: string; gp_name: string; vintage_year: number | null; strategy: string; data_source: string }[]>`
    select m.id, f.name as fund_name, g.name as gp_name, f.vintage_year, f.strategy, f.data_source
    from commitments m join funds f on f.id = m.fund_id join gps g on g.id = f.gp_id
    where m.org_id = ${orgId} and m.status in ('active', 'closed')
      and exists (select 1 from ledger_entries e where e.commitment_id = m.id and e.entry_date <= ${asOf})
    order by f.vintage_year nulls last, f.name
  `;
  const rows: (PortfolioRow & { piece: Piece; group: string; groupLabel: string })[] = [];
  for (const c of list) {
    const { sums, nav, cashflows } = await performanceInputs(orgId, c.id, asOf);
    // 평가액은 여기서 현금흐름에 넣지 않는다 — 합칠 때 기준일 평가액 합계를 한 번만 더한다 (computeMetrics)
    const piece: Piece = { contribution: sums.contribution, distribution: sums.distribution, commitment: sums.commitment, nav: nav.amount, navMissing: nav.missing, flows: cashflows };
    const [group, groupLabel] =
      groupBy === "vintage"
        ? [String(c.vintage_year ?? "미정"), c.vintage_year ? `${c.vintage_year}년` : "결성 연도 없음"]
        : groupBy === "strategy"
          ? [c.strategy, STRATEGY[c.strategy] ?? c.strategy]
          : groupBy === "gp"
            ? [c.gp_name, c.gp_name]
            : [c.data_source, c.data_source === "gp_api" ? "GP 연동" : "수기"];
    rows.push({ ...aggregate(c.id, c.fund_name, asOf, [piece]), ...c, commitment_id: c.id, piece, group, groupLabel });
  }
  const keys = [...new Set(rows.map((r) => r.group))];
  const groups = keys.map((k) => {
    const members = rows.filter((r) => r.group === k);
    return aggregate(k, members[0].groupLabel, asOf, members.map((r) => r.piece));
  });
  return {
    as_of: asOf,
    group_by: groupBy,
    total: aggregate("total", "전체", asOf, rows.map((r) => r.piece)),
    groups,
    commitments: rows.map((r) => {
      const out: Partial<typeof r> = { ...r };
      delete out.piece;
      delete out.group;
      delete out.groupLabel;
      return out as PortfolioRow;
    }),
  };
}
