// GP 원본 구성·복원 후 LP demo-seed를 맞춘다. 기본은 시작 상태 점검, --apply만 동기화한다.
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { createJiti } from 'jiti';

const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });
assert.ok(process.env.DEMO_SEED_BRANCH_ID, 'demo-seed 설정이 필요합니다');
assert.equal(process.env.REVIEW_DEMO_BRANCH_ID, process.env.DEMO_SEED_BRANCH_ID, 'demo-seed 대상 확인이 필요합니다');
assert.notEqual(process.env.NODE_ENV, 'production', '시드 점검은 공유 DB 연결을 사용해야 합니다');
assert.ok(process.env.APP_DATABASE_URL, '대상 DB 주소가 필요합니다');
const q = new URLSearchParams({ branch_id: process.env.DEMO_SEED_BRANCH_ID, database_name: process.env.PGDATABASE, role_name: process.env.PGUSER, pooled: 'false' });
const response = await fetch(`https://console.neon.tech/api/v2/projects/${process.env.NEON_PROJECT_ID}/connection_uri?${q}`, { headers: { Authorization: `Bearer ${process.env.NEON_API_KEY}` } });
assert.ok(response.ok, '대상 확인 실패');
const { uri } = await response.json();
assert.equal(new URL(process.env.APP_DATABASE_URL).host, new URL(uri).host, '다른 DB에는 실행하지 않습니다');
const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve('.') } });
const { sql } = await jiti.import('@/lib/db.ts');
const { DEMO_ORGS, DEMO_ROLES, demoEmail } = await jiti.import('@/lib/auth/demo.ts');
const { portfolioPerformance } = await jiti.import('@/lib/services/performance.ts');
const result = [];
try {
  if (values.apply) {
    // 브라우저 연동으로 받은 새 조합만 보존한다. 계정·기존 조합·연동 키는 복사하지 않는다.
    const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/reviewer-lp-scenario.json', import.meta.url), 'utf8'));
    const tables = ['funds', 'commitments', 'capital_calls', 'payments', 'ledger_entries', 'gp_ledger_entries', 'distributions', 'reconciliations', 'fund_sharing_states', 'reports', 'meetings', 'agendas', 'notices'];
    assert.deepEqual(Object.keys(fixture.tables), tables);
    assert.equal(fixture.tables.funds.length, 2);
    assert.ok(fixture.tables.funds.every(f => f.gp_fund_id === fixture.gp_fund_id && f.name === '체험 분배·청산 검증조합'));
    const orgs = Object.values(DEMO_ORGS).map(o => o.id);
    const fundIds = fixture.tables.funds.map(f => f.id);
    const commitmentIds = fixture.tables.commitments.map(c => c.id);
    const callIds = fixture.tables.capital_calls.map(c => c.id);
    const meetingIds = fixture.tables.meetings.map(m => m.id);
    for (const rows of Object.values(fixture.tables)) for (const row of rows) {
      assert.ok(orgs.includes(row.org_id));
      if (row.fund_id) assert.ok(fundIds.includes(row.fund_id));
      if (row.commitment_id) assert.ok(commitmentIds.includes(row.commitment_id));
      if (row.capital_call_id) assert.ok(callIds.includes(row.capital_call_id));
      if (row.meeting_id) assert.ok(meetingIds.includes(row.meeting_id));
    }
    await sql.begin(async tx => {
      const before = await tx`select id,amount,entry_type,entry_date from ledger_entries order by id`;
      for (const table of tables) {
        const rows = fixture.tables[table];
        if (!rows.length) continue;
        const columns = Object.keys(rows[0]).filter(c => table !== 'funds' || c !== 'vintage_year');
        await tx`insert into ${tx(table)} (${tx(columns)}) select ${tx(columns)} from jsonb_populate_recordset(null::${tx(table)}, ${tx.json(rows)}) on conflict do nothing`;
        for (const row of rows) {
          const [stored] = row.id
            ? await tx`select to_jsonb(t)=${tx.json(row)} as same from ${tx(table)} t where id=${row.id}`
            : await tx`select to_jsonb(t)=${tx.json(row)} as same from ${tx(table)} t where org_id=${row.org_id} and fund_id=${row.fund_id}`;
          assert.equal(stored?.same, true, '기존 체험 데이터가 변경되어 덮어쓰지 않습니다');
        }
      }
      assert.deepEqual(await tx`select id,amount,entry_type,entry_date from ledger_entries where id in ${tx(before.map(r => r.id))} order by id`, before);
    });
  }
  for (const org of ['a', 'b']) {
    const orgId = DEMO_ORGS[org].id;
    for (const role of DEMO_ROLES) {
      const [user] = await sql`select id,role from users where org_id=${orgId} and email=${demoEmail(org, role)} and disabled_at is null`;
      assert.equal(user?.role, role, '기관·역할별 데모 계정이 필요합니다');
    }
    const [link] = await sql`select gp_id from gp_lp_links where org_id=${orgId}`;
    assert.ok(link, '기존 GP 연결이 필요합니다');
    const before = await sql`select id,entry_type,amount,entry_date from ledger_entries where org_id=${orgId} and commitment_id in (select c.id from commitments c join funds f on f.id=c.fund_id where f.org_id=${orgId} and f.name<>'체험 분배·청산 검증조합') order by id`;
    assert.deepEqual(await sql`select id,entry_type,amount,entry_date from ledger_entries where org_id=${orgId} and commitment_id in (select c.id from commitments c join funds f on f.id=c.fund_id where f.org_id=${orgId} and f.name<>'체험 분배·청산 검증조합') order by id`, before);
    const [fund] = await sql`select f.id,c.id as commitment_id,c.status from funds f join commitments c on c.fund_id=f.id where f.org_id=${orgId} and f.name='체험 분배·청산 검증조합'`;
    assert.equal(fund?.status, 'active', '분배 체험 출자 건은 활성 상태여야 합니다');
    const distributions = await sql`select id,amount,status,gp_status from distributions where org_id=${orgId} and commitment_id=${fund.commitment_id}`;
    assert.equal(distributions.length, 1);
    assert.equal(distributions[0].status, 'announced');
    assert.equal(distributions[0].gp_status, 'confirmed');
    assert.equal(Number(distributions[0].amount), org === 'a' ? 15000 : 13500);
    const [proposal] = await sql`select p.id,p.status from proposals p join funds f on f.id=p.fund_id where p.org_id=${orgId} and f.name='딥테크 스케일업 투자조합'`;
    assert.equal(proposal?.status, org === 'a' ? 'screening' : 'received', '기존 선정 체험을 완료 상태로 만들지 않습니다');
    const p = await portfolioPerformance(orgId, '2026-06-30');
    const [linked] = await sql`select c.id as commitment_id from funds f join commitments c on c.fund_id=f.id where f.org_id=${orgId} and f.name='LP연동 데모 벤처투자조합'`;
    const base = p.commitments.find(c => c.commitment_id === linked?.commitment_id);
    assert.ok(base, '기존 기준일 비교 출자 건이 필요합니다');
    assert.ok(Math.abs(base.tvpi - 1.187534247) < 0.001, '기존 과거 성과가 보존되어야 합니다');
    result.push({ org, roles: DEMO_ROLES, distribution_fund_id: fund.id, distribution_commitment_id: fund.commitment_id, distribution_id: distributions[0].id, distribution_amount: Number(distributions[0].amount), selection_proposal_id: proposal.id, selection_status: proposal.status, originalLedgerPreserved: true, originalAsOfTvpiPreserved: true });
  }
  console.log(JSON.stringify({ mode: values.apply ? 'apply' : 'check', accounts: 6, organizations: result }));
} catch (error) {
  console.error(JSON.stringify({ failed: true, code: error.code ?? 'CHECK_FAILED', message: error.code === 'GP_NOT_CONFIGURED' ? error.message : undefined, check: error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0] : undefined }));
  process.exitCode = 1;
} finally { await sql.end(); }
