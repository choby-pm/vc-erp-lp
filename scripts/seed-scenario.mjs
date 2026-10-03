// 전 단계 데모 시나리오 (R7-3, L46~L48). 지금 데이터 위에 **없는 것만** 더한다 — 여러 번 돌려도 결과가 같다.
// 서비스 함수를 그대로 불러 업무 규칙 검사(예산 잔액·부문 한도·평가 필수 등)를 거친다. 이력 날짜는 과거로 고정한다.
//
//   npm run db:seed-scenario     개발 DB(main)에 더한다 → 그다음 짝 맞춘 데모 갱신(GP → LP)으로 배포 데모에 반영
//
// 하늘연금 (성공 기준 1~7)
//   · 2026 예산 분야별 배분
//   · 2026년 정기 출자사업 초기 부문(200억, 2곳): 한결(이미 선정) + 새솔(선정) + 미래로(부문 한도 초과로 선정 결재가 막혀 탈락)
//   · 연동 딥테크 개별 제안: 평가·선정 조건까지 채워 두고 "선정 결재 올리기"는 직접 해볼 거리로 남긴다 (L47)
// 바다성장출자: 2026 예산 + 배분 (기관 분리 보여주기용)
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve('.') } });
const { sql } = await jiti.import('@/lib/db.ts');
const budgets = await jiti.import('@/lib/services/budgets.ts');
const proposals = await jiti.import('@/lib/services/proposals.ts');
const evaluations = await jiti.import('@/lib/services/evaluations.ts');
const selection = await jiti.import('@/lib/services/selection.ts');
const approvals = await jiti.import('@/lib/services/approvals.ts');

const 억 = 100_000_000;
const log = (m) => console.log(`  ${m}`);
const kst = (date, hour = 10) => `${date}T${String(hour).padStart(2, '0')}:00:00+09:00`;

// 단계 이력은 수정 금지(추가만) 테이블이라, 시드에서만 트랜잭션 안에서 보호를 잠깐 끄고 이력 날짜를 과거로 맞춘다
async function backdateHistory(proposalId, toStatus, at) {
  await sql.begin(async (tx) => {
    await tx`alter table proposal_stage_history disable trigger proposal_stage_history_no_update`;
    await tx`update proposal_stage_history set changed_at = ${at} where proposal_id = ${proposalId} and to_status = ${toStatus}`;
    await tx`alter table proposal_stage_history enable trigger proposal_stage_history_no_update`;
  });
}

const ORG_A = '0a000000-0000-4000-8000-00000000000a';
const ORG_B = '0b000000-0000-4000-8000-00000000000b';

const ALLOC_A = { early: 200, growth: 150, secondary: 50, overseas: 50, other: 50 };
const ALLOC_B = { early: 50, growth: 150, other: 100 };

const PROGRAM_NAME = '2026년 정기 출자사업';
const TRACK_NAME = '초기 부문';
const CANDIDATES = [
  {
    gp: '새솔인베스트먼트',
    fund: '새솔 초기성장 1호 조합',
    target: 300,
    requested: 100,
    received: '2026-09-10',
    stages: [['screening', '2026-09-14'], ['due_diligence', '2026-09-18'], ['committee', '2026-09-22']],
    scores: { officer: [88, 82, 85, 80], approver: [85, 84, 82, 78] },
    opinion: { officer: '초기 기업 발굴 이력이 좋고 운용 인력 구성이 안정적', approver: '투자 전략이 부문 목적과 잘 맞음' },
    terms: { planned: 100, deadline: '2026-10-30', keyPerson: '대표펀드매니저 존속 기간 중 유지' },
    decided: '2026-09-26',
    select: true,
  },
  {
    gp: '미래로파트너스',
    fund: '미래로 씨앗 2호 조합',
    target: 250,
    requested: 50,
    received: '2026-09-15',
    stages: [['screening', '2026-09-17'], ['due_diligence', '2026-09-21']],
    scores: { officer: [76, 70, 78, 74], approver: [72, 68, 75, 70] },
    opinion: { officer: '전략은 좋으나 운용 성과 이력이 짧음', approver: '부문 잔여 예정액이 부족하면 다음 사업에서 검토' },
    terms: { planned: 50, deadline: '2027-03-31', keyPerson: null },
    decided: '2026-09-26',
    select: false,
  },
];

async function users(orgId) {
  const rows = await sql`select id, role from users where org_id = ${orgId}`;
  return Object.fromEntries(rows.map((u) => [u.role, u.id]));
}

async function ensureBudget(orgId, userId, year, total, alloc) {
  let [b] = await sql`select id from budgets where org_id = ${orgId} and budget_year = ${year}`;
  if (!b) {
    b = await budgets.createBudget(orgId, userId, { budget_year: year, total_amount: total * 억, memo: `${year}년 출자 예산 (데모)` });
    log(`${year}년 예산 ${total}억 만듦`);
  }
  const [has] = await sql`select count(*)::int as n from budget_allocations where budget_id = ${b.id} and amount > 0`;
  if (has.n === 0) {
    await budgets.putAllocations(orgId, b.id, { allocations: Object.entries(alloc).map(([strategy, a]) => ({ strategy, amount: a * 억 })) });
    log(`분야별 배분: ${Object.entries(alloc).map(([s, a]) => `${s} ${a}억`).join(', ')}`);
  } else log('분야별 배분: 이미 있음');
  return b.id;
}

async function criteria(orgId) {
  return (await evaluations.listCriteria(orgId)).sort((a, b) => a.sort_order - b.sort_order);
}

async function evaluate(orgId, u, proposalId, stage, date, scoresByRole, opinionByRole, crit) {
  for (const role of ['officer', 'approver']) {
    const [done] = await sql`select 1 from evaluations where proposal_id = ${proposalId} and evaluator_id = ${u[role]} and stage = ${stage}`;
    if (done) continue;
    await evaluations.saveMyEvaluation(orgId, u[role], proposalId, stage, {
      evaluated_date: date,
      opinion: opinionByRole[role],
      scores: crit.map((c, i) => ({ criterion_id: c.id, score: scoresByRole[role][i] })),
    });
  }
}

async function candidate(orgId, u, trackId, budgetId, c, crit) {
  console.log(`• ${c.fund} (${c.gp})`);
  let [p] = await sql`select pr.id, pr.status from proposals pr join funds f on f.id = pr.fund_id where pr.org_id = ${orgId} and f.name = ${c.fund}`;
  if (!p) {
    const [gp] = await sql`select id from gps where org_id = ${orgId} and name = ${c.gp}`;
    const created = await proposals.createProposal(orgId, u.officer, {
      proposal_channel: 'program',
      program_track_id: trackId,
      fund_id: null,
      new_fund: {
        gp_id: gp?.id ?? null,
        new_gp: gp ? null : { name: c.gp, gp_type: 'venture_capital' },
        name: c.fund,
        fund_type: 'venture',
        strategy: 'early',
        target_amount: c.target * 억,
        term_years: 8,
        investment_period_years: 4,
        management_fee_rate: 0.02,
        carry_rate: 0.2,
        hurdle_rate: 0.07,
      },
      requested_amount: c.requested * 억,
      received_date: c.received,
      memo: null,
    });
    p = { id: created.id, status: created.status };
    log(`제안 접수 ${c.received} · 요청 ${c.requested}억`);
  }
  await backdateHistory(p.id, 'received', kst(c.received, 9)); // 접수 이력도 접수일로
  if (['selected', 'rejected'].includes(p.status)) return log(`이미 결정됨 (${p.status}) — 건너뜀`);

  // 심사 단계 · 평가 (서류 심사 평가 2건)
  for (const [stage, date] of c.stages) {
    const [cur] = await sql`select status from proposals where id = ${p.id}`;
    const order = ['received', 'screening', 'due_diligence', 'presentation', 'committee'];
    if (order.indexOf(cur.status) < order.indexOf(stage)) await proposals.moveStage(orgId, u.officer, p.id, stage, null);
    await backdateHistory(p.id, stage, kst(date)); // 이미 옮긴 단계도 날짜를 맞춘다 (다시 돌려도 같음)
    if (stage === 'screening') await evaluate(orgId, u, p.id, 'screening', date, c.scores, c.opinion, crit);
  }
  log(`심사: ${c.stages.map(([s]) => s).join(' → ')} · 평가 2건`);

  // 선정 조건
  if (!(await selection.getSelectionTerms(orgId, p.id))) {
    await selection.putSelectionTerms(orgId, u.officer, p.id, {
      budget_id: budgetId,
      planned_amount: c.terms.planned * 억,
      max_commitment_ratio: null,
      formation_deadline: c.terms.deadline,
      key_person_condition: c.terms.keyPerson,
    });
  }

  // 선정 결재 기안 → 승인 (또는 부문 한도 초과로 막힘 → 탈락)
  try {
    const { approval_id } = await selection.requestSelection(orgId, u.officer, p.id, `${c.fund} 선정 결재 올립니다`);
    if (!c.select) throw new Error('선정되면 안 되는 후보가 결재에 올라갔습니다 (데모 숫자 확인)');
    await approvals.approve(orgId, u.approver, approval_id, '투자심의위원회 의결대로 승인');
    const d = c.decided;
    await sql`update approvals set requested_at = ${kst(d, 9)}, created_at = ${kst(d, 9)}, decided_at = ${kst(d, 15)} where id = ${approval_id}`;
    await sql`update proposals set decided_date = ${d} where id = ${p.id}`;
    await backdateHistory(p.id, 'selected', kst(d, 15));
    await sql`update commitments set created_at = ${kst(d, 15)} where proposal_id = ${p.id}`;
    log(`선정 결재 승인 ${d} → 출자 건(결성 대기) · 결성 기한 ${c.terms.deadline}`);
  } catch (err) {
    if (c.select || !['TRACK_AMOUNT_EXCEEDED', 'BUDGET_EXCEEDED'].includes(err.code)) throw err;
    log(`선정 결재 기안이 막힘 (${err.code}): ${err.message}`);
    await proposals.rejectProposal(orgId, u.officer, p.id, { decided_date: c.decided, note: `탈락 — 선정 결재 기안이 막힘: ${err.message}` });
    await backdateHistory(p.id, 'rejected', kst(c.decided, 16));
    log(`탈락 ${c.decided}`);
  }
}

// 연동 딥테크 개별 제안: 평가·선정 조건까지 (결재 기안은 직접 해볼 거리)
async function deeptech(orgId, u, budgetId, crit) {
  console.log('• 딥테크 스케일업 투자조합 (연동 개별 제안)');
  const [p] = await sql`select pr.id, pr.status from proposals pr join funds f on f.id = pr.fund_id where pr.org_id = ${orgId} and f.name like '딥테크%'`;
  if (!p) return log('제안이 없어 건너뜀 (GP 시드의 출자 제안 발송을 먼저)');
  await backdateHistory(p.id, 'received', kst('2026-09-22', 9)); // GP 제안 접수일
  if (p.status !== 'received' && p.status !== 'screening') return log(`이미 진행됨 (${p.status}) — 건너뜀`);
  if (p.status === 'received') {
    // 연동 제안이라 단계를 옮기면 GP에 "검토 중"이 전달된다 (BR-PROP-06)
    await proposals.moveStage(orgId, u.officer, p.id, 'screening', null);
    await backdateHistory(p.id, 'screening', kst('2026-09-28'));
    log('서류 심사로 옮김 (GP에 검토 중 전달)');
  }
  const [ev] = await sql`select count(*)::int as n from evaluations where proposal_id = ${p.id}`;
  if (ev.n === 0) {
    await evaluations.saveMyEvaluation(orgId, u.officer, p.id, 'screening', {
      evaluated_date: '2026-10-02',
      opinion: '딥테크 후속 투자 전략이 명확함. 우리 GP 시스템 연동 조합',
      scores: crit.map((c, i) => ({ criterion_id: c.id, score: [84, 80, 86, 78][i] ?? 80 })),
    });
    log('서류 심사 평가 1건');
  }
  if (!(await selection.getSelectionTerms(orgId, p.id))) {
    await selection.putSelectionTerms(orgId, u.officer, p.id, {
      budget_id: budgetId,
      planned_amount: 30 * 억,
      max_commitment_ratio: 0.1,
      formation_deadline: '2027-03-31',
      key_person_condition: '대표펀드매니저 존속 기간 중 유지',
    });
    log('선정 조건: 30억 · 결성 기한 2027-03-31 · 출자 비율 상한 10%');
  }
  log('→ 직접 해볼 거리: 출자 담당이 "선정 결재 올리기" → 결재권자가 승인 → GP 화면에서 "확약"');
}

try {
  console.log('하늘연금 (데모)');
  const ua = await users(ORG_A);
  const budgetA = await ensureBudget(ORG_A, ua.officer, 2026, 500, ALLOC_A);
  const [track] = await sql`
    select t.id from program_tracks t join programs p on p.id = t.program_id
    where p.org_id = ${ORG_A} and p.name = ${PROGRAM_NAME} and t.name = ${TRACK_NAME}
  `;
  if (!track) throw new Error(`${PROGRAM_NAME} · ${TRACK_NAME} 이 없습니다`);
  const crit = await criteria(ORG_A);
  for (const c of CANDIDATES) await candidate(ORG_A, ua, track.id, budgetA, c, crit);
  await deeptech(ORG_A, ua, budgetA, crit);

  console.log('\n바다성장출자 (데모)');
  const ub = await users(ORG_B);
  await ensureBudget(ORG_B, ub.officer, 2026, 300, ALLOC_B);
  console.log('\n✔ 데모 시나리오를 채웠습니다');
} catch (err) {
  console.error('✖ 데모 시나리오 실패:', err.code ?? '', err.message, err.details ? JSON.stringify(err.details) : '');
  process.exitCode = 1;
} finally {
  await sql.end();
}
