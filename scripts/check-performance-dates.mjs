// 읽기 전용: 날짜 경계에서 원장 행을 독립 합산해 상세/전체 성과와 비교한다.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve('.') } });
const { performanceDate, todayKst } = await jiti.import('@/lib/performance-date.ts');
for (const raw of [undefined, null, '']) assert.equal(performanceDate(raw), todayKst());
for (const raw of ['2026-06-30', '2024-02-29', '2099-12-31']) assert.equal(performanceDate(raw), raw);
for (const raw of ['2026-02-30', '2026-02-29', '2026-04-31', 'bad', '2026-6-30', '0000-01-01', ['2026-06-30', '2026-07-01']]) assert.equal(performanceDate(raw), null);
console.log('날짜 검증 13건 통과');
if (!process.argv.includes('--db')) process.exit(0);
const { sql } = await jiti.import('@/lib/db.ts');
const { commitmentPerformance, portfolioPerformance, performanceInputs } = await jiti.import('@/lib/services/performance.ts');
let checks = 0;
try {
  const commitments = await sql`select id, org_id from commitments where status = 'active'`;
  for (const c of commitments) {
    const entries = await sql`select entry_type, entry_date::text as date, amount from ledger_entries where org_id = ${c.org_id} and commitment_id = ${c.id}`;
    const dates = new Set(['2026-06-30']);
    for (const e of entries.filter(e => ['contribution', 'distribution'].includes(e.entry_type))) {
      for (const delta of [-1, 0, 1]) { const d = new Date(`${e.date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + delta); dates.add(d.toISOString().slice(0, 10)); }
    }
    for (const date of [...dates].sort()) {
      const single = await commitmentPerformance(c.org_id, c.id, date);
      const portfolio = await portfolioPerformance(c.org_id, date);
      const row = portfolio.commitments.find(r => r.commitment_id === c.id);
      const expected = type => entries.filter(e => e.entry_type === type && e.date <= date).reduce((s,e) => s + Number(e.amount), 0);
      assert.equal(single.contribution_amount, expected('contribution'));
      assert.equal(single.distribution_amount, expected('distribution'));
      if (row) {
        for (const key of ['commitment_amount', 'contribution_amount', 'distribution_amount', 'tvpi', 'dpi', 'rvpi', 'irr']) assert.equal(single[key], row[key]);
        assert.equal(single.nav.amount, row.nav_amount);
      } else assert.ok(!entries.some(e => e.date <= date));
      console.log(JSON.stringify({ commitment: c.id, date, contribution: single.contribution_amount, distribution: single.distribution_amount, nav: single.nav.amount }));
      checks++;
    }
  }
  console.log(`DB 날짜 경계 ${checks}건 통과 (데이터 변경 없음)`);
  // 기존 출자 건에 임시 거래를 넣고 같은 트랜잭션에서만 조회, 항상 롤백한다.
  // 공개 데모나 기존 원장을 변경하지 않는다. 금액은 원 단위 정밀도로 검사한다.
  const c = commitments[0];
  assert.ok(c, '정정 검증에 사용할 활성 출자 건이 필요합니다');
  const rollback = new Error('W01_FIXTURE_ROLLBACK');
  try {
    await sql.begin(async tx => {
      const dates = ['2090-01-09','2090-01-10','2090-01-11','2090-01-19','2090-01-20','2090-01-21','2090-01-29','2090-01-30','2090-01-31'];
      const baseline = new Map();
      for (const date of dates) baseline.set(date, await performanceInputs(c.org_id, c.id, date, tx));
      const [original] = await tx`insert into ledger_entries (org_id, commitment_id, entry_type, amount, entry_date, source_type, source_id, memo) values (${c.org_id}, ${c.id}, 'contribution', 100000001, '2090-01-10', 'payment', gen_random_uuid(), 'W01 rollback fixture') returning id`;
      await tx`insert into ledger_entries (org_id, commitment_id, entry_type, amount, entry_date, source_type, source_id, memo) values (${c.org_id}, ${c.id}, 'distribution', 40000001, '2090-01-20', 'distribution', gen_random_uuid(), 'W01 rollback fixture')`;
      await tx`insert into ledger_entries (org_id, commitment_id, entry_type, amount, entry_date, source_type, source_id, reversal_of_id, memo) values (${c.org_id}, ${c.id}, 'contribution', -100000001, '2090-01-30', 'payment', gen_random_uuid(), ${original.id}, 'W01 rollback fixture reversal')`;
      await tx`insert into ledger_entries (org_id, commitment_id, entry_type, amount, entry_date, source_type, source_id, memo) values (${c.org_id}, ${c.id}, 'contribution', 90000001, '2090-01-30', 'payment', gen_random_uuid(), 'W01 rollback fixture correction')`;
      for (const date of dates) {
        const p = await performanceInputs(c.org_id, c.id, date, tx), b = baseline.get(date);
        const contribution = date < '2090-01-10' ? 0 : date < '2090-01-30' ? 100000001 : 90000001;
        const distribution = date < '2090-01-20' ? 0 : 40000001;
        assert.equal(p.sums.contribution - b.sums.contribution, contribution);
        assert.equal(p.sums.distribution - b.sums.distribution, distribution);
        assert.equal(p.cashflows.filter(f=>f.kind==='contribution').reduce((s,f)=>s+f.amount,0) - b.cashflows.filter(f=>f.kind==='contribution').reduce((s,f)=>s+f.amount,0), contribution === 0 ? 0 : -contribution);
      }
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  const [left] = await sql`select count(*)::int as count from ledger_entries where memo like 'W01 rollback fixture%'`;
  assert.equal(left.count, 0);
  console.log('중간 납입·분배·취소/재기록 정정 경계 9건 통과, 임시 행 0건(롤백 확인)');
} finally { await sql.end(); }
