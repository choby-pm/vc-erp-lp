// 숫자 일치 점검 (R7-2, 성공 기준 6): 대시보드 · 성과 · 출자 건 상세 · 장부 · 예산 · 자금 계획 · 30일 일정의 숫자가 서로 같은지 확인한다.
// 아무것도 바꾸지 않는다 (읽기만).
//
//   npm run check:numbers              개발 DB (main)
//   npm run check:numbers -- --demo    배포 사이트가 쓰는 데모 DB (Neon demo 브랜치)
//
// 하나라도 다르면 ✕ 를 찍고 종료 코드 1 로 끝난다.
import path from 'node:path';
import { createJiti } from 'jiti';

if (process.argv.includes('--demo')) {
  const { NEON_API_KEY, NEON_PROJECT_ID, DEMO_BRANCH_ID, PGDATABASE, PGUSER } = process.env;
  if (!NEON_API_KEY || !NEON_PROJECT_ID || !DEMO_BRANCH_ID) {
    console.error('NEON_API_KEY, NEON_PROJECT_ID, DEMO_BRANCH_ID 가 .env.local 에 필요합니다.');
    process.exit(1);
  }
  const q = new URLSearchParams({ branch_id: DEMO_BRANCH_ID, database_name: PGDATABASE, role_name: PGUSER, pooled: 'true' });
  const res = await fetch(`https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/connection_uri?${q}`, { headers: { Authorization: `Bearer ${NEON_API_KEY}` } });
  if (!res.ok) {
    console.error(`데모 DB 주소를 받지 못했습니다 (HTTP ${res.status})`);
    process.exit(1);
  }
  process.env.APP_DATABASE_URL = (await res.json()).uri; // lib/db.ts 가 이 값을 먼저 쓴다
}

const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve('.') } });
const { sql } = await jiti.import('@/lib/db.ts');
const { getDashboard } = await jiti.import('@/lib/services/dashboard.ts');
const { portfolioPerformance, commitmentPerformance, todayKst } = await jiti.import('@/lib/services/performance.ts');
const { getLedger } = await jiti.import('@/lib/services/commitment-ledger.ts');
const { listBudgets } = await jiti.import('@/lib/services/budgets.ts');
const { getCashPlan } = await jiti.import('@/lib/services/cash-plan.ts');
const { formatKRW } = await jiti.import('@/lib/format.ts');

let failed = 0;
let passed = 0;
const check = (label, ok, detail = '') => {
  if (ok) passed++;
  else failed++;
  if (!ok || process.argv.includes('--verbose')) console.log(`  ${ok ? '✓' : '✕'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const eq = (a, b) => (a === null || b === null ? a === b : Math.abs(Number(a) - Number(b)) < 1e-6);
const 억 = (n) => `${(Number(n) / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}억`;
const AMOUNTS = ['commitment_amount', 'contribution_amount', 'distribution_amount', 'nav_amount'];

const today = todayKst();
console.log(`숫자 일치 점검 · ${process.argv.includes('--demo') ? '데모 DB' : '개발 DB'} · ${today} 기준\n`);

try {
  const orgs = await sql`select id, name from orgs order by name`;
  for (const org of orgs) {
    const [user] = await sql`select id, role from users where org_id = ${org.id} and role = 'admin' order by created_at limit 1`;
    const before = failed;
    const d = await getDashboard(org.id, user);
    const perf = await portfolioPerformance(org.id, today, 'vintage');

    // 1) 대시보드 포트폴리오 = 성과 화면 전체
    for (const k of [...AMOUNTS, 'tvpi', 'dpi', 'rvpi', 'irr']) check(`대시보드 ${k} = 성과 화면`, eq(d.portfolio[k], perf.total[k]), `${d.portfolio[k]} / ${perf.total[k]}`);

    // 2) 묶음 4가지 모두: 묶음 금액 합 = 전체
    for (const g of ['vintage', 'strategy', 'gp', 'source']) {
      const p = g === 'vintage' ? perf : await portfolioPerformance(org.id, today, g);
      for (const k of AMOUNTS) check(`${g} 묶음 ${k} 합 = 전체`, eq(p.groups.reduce((s, x) => s + x[k], 0), p.total[k]));
      check(`${g} 묶음 건수 합 = 전체`, p.groups.reduce((s, x) => s + x.count, 0) === p.total.count);
    }

    // 3) 전체 배수 = 금액 합계로 다시 나눈 값 (BR-PERF-05)
    const t = perf.total;
    if (t.contribution_amount > 0) {
      check('전체 TVPI = (분배 + 평가액) ÷ 납입', eq(t.tvpi, Number(((t.distribution_amount + t.nav_amount) / t.contribution_amount).toFixed(4))), `${t.tvpi}`);
    }

    // 4) 출자 건별: 성과 화면 표 = 출자 건 상세 성과 = 장부 합계 = DB 뷰
    let sumC = 0, sumD = 0, sumN = 0;
    for (const row of perf.commitments) {
      const single = await commitmentPerformance(org.id, row.commitment_id, today);
      const ledger = await getLedger(org.id, row.commitment_id);
      const [view] = await sql`select commitment_amount, contribution_amount, distribution_amount from v_commitment_summary where commitment_id = ${row.commitment_id}`;
      const ours = (type) => ledger.totals.find((x) => x.entry_type === type)?.our_amount ?? 0;
      const name = row.fund_name;
      check(`${name} 표 TVPI·IRR = 상세`, eq(row.tvpi, single.tvpi) && eq(row.irr, single.irr), `${row.tvpi}·${row.irr} / ${single.tvpi}·${single.irr}`);
      check(`${name} 납입 = 장부 = 뷰`, eq(single.contribution_amount, ours('contribution')) && eq(single.contribution_amount, view.contribution_amount), `${억(single.contribution_amount)} / ${억(ours('contribution'))} / ${억(view.contribution_amount)}`);
      check(`${name} 분배 = 장부 = 뷰`, eq(single.distribution_amount, ours('distribution')) && eq(single.distribution_amount, view.distribution_amount), `${억(single.distribution_amount)} / ${억(ours('distribution'))} / ${억(view.distribution_amount)}`);
      check(`${name} 약정 = 장부 = 뷰`, eq(single.commitment_amount, ours('commitment')) && eq(single.commitment_amount, view.commitment_amount));
      sumC += single.contribution_amount;
      sumD += single.distribution_amount;
      sumN += single.nav.amount;
    }
    check('출자 건 상세 합 = 대시보드 (납입·분배·평가액)', eq(sumC, d.portfolio.contribution_amount) && eq(sumD, d.portfolio.distribution_amount) && eq(sumN, d.portfolio.nav_amount), `${억(sumC)}·${억(sumD)}·${억(sumN)}`);

    // 5) 청산된 출자 건: 고정한 최종 성과 = 청산일 기준 장부
    for (const c of await sql`select m.id, f.name, m.closed_date::text, m.final_metrics from commitments m join funds f on f.id = m.fund_id where m.org_id = ${org.id} and m.status = 'closed'`) {
      const p = await commitmentPerformance(org.id, c.id, c.closed_date);
      check(`${c.name} 최종 성과 = 청산일 장부`, eq(c.final_metrics.contribution_amount, p.contribution_amount) && eq(c.final_metrics.distribution_amount, p.distribution_amount) && eq(c.final_metrics.tvpi, p.tvpi));
    }

    // 6) 예산: 대시보드 = 예산 목록, 분야별 사용 합 = 사용
    const year = Number(today.slice(0, 4));
    const listed = (await listBudgets(org.id)).find((b) => b.budget_year === year) ?? null;
    check('대시보드 올해 예산 = 예산 화면', (d.budget === null && listed === null) || (d.budget && listed && eq(d.budget.used_amount, listed.used_amount) && eq(d.budget.total_amount, listed.total_amount)));
    if (d.budget) {
      check('분야별 사용 합 = 예산 사용', eq(d.budget.strategies.reduce((s, x) => s + x.used_amount, 0), d.budget.used_amount));
      check('잔액 = 총액 − 사용', eq(d.budget.remaining_amount, d.budget.total_amount - d.budget.used_amount));
    }

    // 7) 자금 계획: 대시보드 12개월 = 자금 계획 화면
    const plan = await getCashPlan(org.id);
    check('대시보드 월별 납입 예정 = 자금 계획', JSON.stringify(plan.months) === JSON.stringify(d.cash.months));
    check('기한 지난 미납 = 자금 계획', eq(plan.overdue_unpaid, d.cash.overdue_unpaid));

    // 8) 30일 일정의 콜 남은 금액 = 캐피탈콜 납입 현황
    const left = await sql`select c.id, (c.call_amount - s.paid_amount)::bigint as left from capital_calls c join v_capital_call_status s on s.capital_call_id = c.id where c.org_id = ${org.id}`;
    for (const it of d.schedule.filter((x) => x.kind === 'call_due')) {
      const row = left.find((r) => it.href.endsWith(r.id));
      check(`일정 ${it.title} 남은 금액`, Boolean(row) && it.detail.includes(formatKRW(Number(row.left))), it.detail);
    }

    console.log(`${failed === before ? '✓' : '✕'} ${org.name} · 출자 건 ${perf.total.count}건 · TVPI ${perf.total.tvpi ?? '-'} · 납입 ${억(t.contribution_amount)} · 분배 ${억(t.distribution_amount)} · 평가액 ${억(t.nav_amount)}`);
  }
} finally {
  await sql.end();
}

console.log(`\n${failed === 0 ? '✔ 모두 일치' : `✖ 다름 ${failed}건`} (확인 ${passed + failed}개)`);
process.exitCode = failed === 0 ? 0 : 1;
