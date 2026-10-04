// GP ↔ LP 업무 흐름 QA (docs/96_qa_scenarios.md). 배포 GP·LP 사이트에 실제로 요청을 보낸다.
//
//   npm run qa:e2e              실행 (배포 데모 데이터가 바뀐다)
//   npm run qa:e2e -- --reset   실행 뒤 짝 맞춘 데모 갱신(GP → LP)으로 처음 상태로 되돌린다
//
// 시작 상태는 데모 시드 그대로여야 한다 (매일 03:00 초기화 상태). 결과는 ID별 ✓/✕ 와 마지막 요약.
// Q7-2 준비(분배일을 오늘로)만 GP 데모 DB를 직접 고친다 — GP는 분배일 전 지급을 막기 때문 (../gp/.env.local 의 Neon 값 사용)
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import postgres from 'postgres';

const LP = process.env.QA_LP_URL ?? 'https://vc-erp-lp.vercel.app';
const GP = process.env.QA_GP_URL ?? 'https://vc-erp-gp.vercel.app';
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const 억 = 100_000_000;
const results = [];
let current = '';

const check = (id, label, ok, detail = '') => {
  results.push({ id, label, ok: Boolean(ok), detail: String(detail ?? '') });
  console.log(`${ok ? '✓' : '✕'} ${id} ${label}${detail ? ` — ${detail}` : ''}`);
};
const phase = (t) => { current = t; console.log(`\n── ${t}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// 목록 응답은 배열이거나 { items | calls | meetings | notices … } 안에 배열이 있다
const list = (r) => (Array.isArray(r?.data) ? r.data : (r?.data && Object.values(r.data).find(Array.isArray)) ?? []);
async function poll(fn, ok, tries = 12, ms = 2500) {
  let v;
  for (let i = 0; i < tries; i++) {
    v = await fn();
    if (ok(v)) return v;
    await wait(ms);
  }
  return v;
}

async function session(base, login, body) {
  const r = await fetch(base + login, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const call = async (method, path, data, key) => {
    const res = await fetch(base + '/api/v1' + path, {
      method,
      headers: { cookie, 'Content-Type': 'application/json', 'Idempotency-Key': key ?? crypto.randomUUID() },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const text = await res.text();
    try { return { status: res.status, ...JSON.parse(text) }; } catch { return { status: res.status, raw: text.slice(0, 200) }; }
  };
  call.loginStatus = r.status;
  call.cookie = cookie;
  return call;
}
const lpAs = (org, role) => session(LP, '/api/v1/auth/demo-login', { org, role });

const readEnv = (file) => Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]));
async function gpDemoSql() {
  const e = readEnv(new URL('../../gp/.env.local', import.meta.url));
  const q = new URLSearchParams({ branch_id: e.DEMO_BRANCH_ID, database_name: e.PGDATABASE, role_name: e.PGUSER, pooled: 'true' });
  const r = await fetch(`https://console.neon.tech/api/v2/projects/${e.NEON_PROJECT_ID}/connection_uri?${q}`, { headers: { Authorization: `Bearer ${e.NEON_API_KEY}` } });
  return postgres((await r.json()).uri, { max: 1 });
}

try {
  // ── 0. 준비
  phase('0. 준비');
  const off = await lpAs('a', 'officer'), apr = await lpAs('a', 'approver'), adm = await lpAs('a', 'admin');
  const bOff = await lpAs('b', 'officer'), bApr = await lpAs('b', 'approver'), bAdm = await lpAs('b', 'admin');
  const gp = await session(GP, '/api/v1/auth/demo-login');
  check('Q0-1', 'LP 6개 계정 · GP 데모 로그인', [off, apr, adm, bOff, bApr, bAdm, gp].every((s) => s.loginStatus === 200), [off, apr, adm, bOff, bApr, bAdm, gp].map((s) => s.loginStatus).join(','));
  const integ = (await adm('GET', '/integration')).data;
  const conn = integ.links?.[0] ?? integ.connections?.[0];
  check('Q0-2', 'LP 연동 설정', conn && (integ.counts?.failed ?? 0) === 0, `연결 ${conn?.connection_name ?? '-'} · 실패 ${integ.counts?.failed ?? '?'}`);

  const gFunds = list(await gp('GET', '/funds'));
  const gFund = (n) => gFunds.find((f) => f.name.startsWith(n));
  const gL = gFund('LP연동'), gD = gFund('딥테크');
  const commitments = async () => (await off('GET', '/commitments')).data;
  const L = (await commitments()).find((c) => c.origin === 'imported');

  // ── 1. LP 계획
  phase('1. LP · 출자 계획');
  const dash0 = (await off('GET', '/dashboard')).data;
  const b0 = dash0.budget;
  const allocSum = b0.strategies.reduce((s, x) => s + x.allocated_amount, 0);
  check('Q1-1', '2026 예산 500억 · 배분 합 500억 · 사용 170억', b0.total_amount === 500 * 억 && allocSum === 500 * 억 && b0.used_amount === 170 * 억, `${b0.total_amount / 억} · ${allocSum / 억} · ${b0.used_amount / 억}`);
  const props = list(await off('GET', '/proposals'));
  const prop = (n) => props.find((p) => p.fund_name.startsWith(n));
  const program = (await off('GET', `/programs/${prop('새솔').program_id}`)).data;
  const track = program.tracks?.[0];
  const inTrack = props.filter((p) => p.program_id === program.id && p.track_name === track?.name);
  check('Q1-2', '초기 부문 200억 · 접수 3건 · 선정 2곳', track?.planned_amount === 200 * 억 && inTrack.length === 3 && inTrack.filter((p) => p.status === 'selected').length === 2, `${track?.planned_amount / 억}억 · ${inTrack.length}건 · 선정 ${inTrack.filter((p) => p.status === 'selected').length}`);

  const boardA = list(await off('GET', '/board'));
  const boardB = list(await bOff('GET', '/board'));
  const hanulCall = boardB.find((x) => x.name === '2026년 정기 출자사업');
  const badaCall = boardA.find((x) => x.name === '2026년 하반기 성장 출자사업');
  check('Q1-3', '공고 게시판: 두 기관 공고가 서로 보인다 (공고 항목만)', hanulCall && !hanulCall.is_mine && badaCall && !badaCall.is_mine && !('budget_id' in hanulCall), `바다→하늘 ${Boolean(hanulCall)} · 하늘→바다 ${Boolean(badaCall)}`);

  // ── 2. GP 제안 → LP 접수
  phase('2. GP · 출자 제안 → LP 자동 접수');
  const dt = prop('딥테크');
  const gProps = list(await gp('GET', `/funds/${gD.id}/proposals`));
  const gMine = gProps.find((p) => p.lp_name === '하늘연금');
  check('Q2-1 🔗', 'GP 하늘연금 제안 = LP 연동 제안 (30억)', dt.data_source === 'gp_api' && dt.requested_amount === 30 * 억 && Number(gMine?.proposed_amount) === 30 * 억, `LP ${dt.data_source} ${dt.requested_amount / 억}억 · GP ${Number(gMine?.proposed_amount) / 억}억 ${gMine?.status}`);
  const resend = await gp('POST', `/funds/${gD.id}/proposals/${gMine.id}/send`, {});
  await wait(6000);
  await adm('POST', '/integration/pull', {});
  const dtCount = list(await off('GET', '/proposals')).filter((p) => p.fund_name.startsWith('딥테크')).length;
  check('Q2-2 🔗', 'GP 재발송해도 LP 제안 1건', dtCount === 1, `GP 재발송 ${resend.status} · LP 딥테크 제안 ${dtCount}건`);
  const gpCalls = list(await gp('GET', '/lp-calls'));
  check('Q2-3 🔗', 'GP 출자사업 공고 = LP 게시판 (두 기관 · 연동됨)', gpCalls.length >= 2 && gpCalls.every((c) => c.linked && c.gp_lp_id), gpCalls.map((c) => `${c.org_name} ${c.linked ? '연동' : '-'}`).join(' / '));
  const gHanulCall = gpCalls.find((c) => c.name === '2026년 정기 출자사업');
  const earlyTrack = gHanulCall.tracks[0];
  const growthFund = gFunds.find((f) => f.name.startsWith('그로스'));
  const mismatch = await gp('POST', `/lp-calls/${gHanulCall.id}/apply`, { fund_id: growthFund.id, track_id: earlyTrack.id, proposed_amount: 20 * 억, memo: null });
  check('Q2-4 ⛔', '성장 조합으로 초기 부문 지원 → 거부', mismatch.status === 422 && mismatch.error?.code === 'STRATEGY_MISMATCH', `${mismatch.status} ${mismatch.error?.code}`);
  const nextBio = gFunds.find((f) => f.name.startsWith('넥스트 바이오'));
  const applied = await gp('POST', `/lp-calls/${gHanulCall.id}/apply`, { fund_id: nextBio.id, track_id: earlyTrack.id, proposed_amount: 20 * 억, memo: 'QA 공고 지원' });
  const lpApplied = await poll(async () => list(await off('GET', '/proposals')).find((p) => p.fund_name.startsWith('넥스트 바이오')), Boolean, 4, 1500);
  check('Q2-5 🔗', 'GP 지원 → LP 초기 부문에 공고형 자동 접수', applied.status === 201 && applied.data?.status === 'sent' && lpApplied?.proposal_channel === 'program' && lpApplied.track_name === earlyTrack.name, `GP ${applied.status} ${applied.data?.status} · LP ${lpApplied?.proposal_channel} ${lpApplied?.track_name}`);
  {
    const lpKeys = readEnv(new URL('../.env.local', import.meta.url));
    const raw = JSON.stringify({ gp_proposal_id: crypto.randomUUID(), gp_lp_id: gHanulCall.gp_lp_id, program_id: gHanulCall.id, track_id: earlyTrack.id });
    const ts = new Date().toISOString();
    const sig = 'sha256=' + (await import('node:crypto')).createHmac('sha256', 'wrong-' + (lpKeys.GP_DEMO_WEBHOOK_SECRET ?? '').length).update(`${ts}.POST /api/gp/v1/applications
${raw}`).digest('hex');
    const forgedApp = await fetch(`${LP}/api/gp/v1/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-lp-connection-id': conn.gp_connection_id, 'x-gp-timestamp': ts, 'x-gp-signature': sig }, body: raw });
    check('Q2-6 ⛔🔗', '서명 위조 공고 지원 → 401', forgedApp.status === 401, String(forgedApp.status));
  }

  // ── 3. LP 심사·선정 → GP 확약
  phase('3. LP · 심사 · 선정 결재 → GP 확약');
  const mr = (await off('GET', `/proposals/${prop('미래로').id}`)).data;
  const note = (mr.history ?? []).find((h) => h.to_status === 'rejected')?.note ?? '';
  check('Q3-1 ⛔', '미래로 탈락 사유에 부문 한도 차단 기록', note.includes('부문 잔여 30억'), note.slice(0, 60));
  const req = await off('POST', `/proposals/${dt.id}/selection-approvals`, { request_comment: 'QA 딥테크 선정' });
  check('Q3-2', '딥테크 선정 결재 기안', req.status === 201 && req.data?.approval_id, `${req.status} ${req.error?.code ?? ''}`);
  const selfApprove = await off('POST', `/approvals/${req.data.approval_id}/approve`, { decision_comment: null });
  check('Q3-3 ⛔', '출자 담당 승인 시도 → 403', selfApprove.status === 403, `${selfApprove.status} ${selfApprove.error?.code ?? ''}`);
  const approved = await apr('POST', `/approvals/${req.data.approval_id}/approve`, { decision_comment: 'QA 승인' });
  const dtAfter = (await off('GET', `/proposals/${dt.id}`)).data;
  const dtCommit = (await commitments()).find((c) => c.fund_name.startsWith('딥테크'));
  const b1 = (await off('GET', '/dashboard')).data.budget;
  check('Q3-4', '선정 · 출자 건(결성 대기) · 예산 사용 200억', approved.status === 200 && dtAfter.status === 'selected' && dtCommit?.status === 'awaiting_formation' && b1.used_amount === 200 * 억, `${dtAfter.status} · ${dtCommit?.status} · ${b1.used_amount / 억}억 · gp_sync ${approved.data?.gp_sync?.status}`);
  const gMine2 = list(await gp('GET', `/funds/${gD.id}/proposals`)).find((p) => p.lp_name === '하늘연금');
  check('Q3-5 🔗', 'GP 하늘연금 확약 30억 · LP 직접', gMine2?.status === 'committed' && Number(gMine2.loc_amount) === 30 * 억 && gMine2.decided_via === 'lp_system', `${gMine2?.status} · ${Number(gMine2?.loc_amount) / 억}억 · ${gMine2?.decided_via}`);
  {
    const nb = lpApplied;
    await off('POST', `/proposals/${nb.id}/stage`, { to_status: 'screening', note: null });
    const crit = (await off('GET', '/evaluation-criteria')).data.criteria.filter((c) => !c.retired_at);
    await off('PUT', `/proposals/${nb.id}/evaluations/screening`, { evaluated_date: null, opinion: 'QA', scores: crit.map((c) => ({ criterion_id: c.id, score: 80 })) });
    await off('PUT', `/proposals/${nb.id}/selection-terms`, { budget_id: b0.id, planned_amount: 20 * 억, max_commitment_ratio: 0.25, formation_deadline: '2027-03-31', key_person_condition: 'QA 대표펀드매니저 유지' });
    const ra = await off('POST', `/proposals/${nb.id}/selection-approvals`, { request_comment: 'QA 공고 지원 선정' });
    const rb = await apr('POST', `/approvals/${ra.data?.approval_id}/approve`, { decision_comment: null });
    const anchors = (await gp('GET', `/funds/${nextBio.id}/proposals`)).data.summary.anchors;
    const anc = anchors.find((a) => a.lp_name === '하늘연금');
    check('Q3-6 🔗', '공고 지원 선정 → GP 확약 + 앵커 조건 (필요한 최소 결성액 80억)', rb.status === 200 && anc?.required_fund_amount === 80 * 억 && anc.formation_deadline === '2027-03-31', `${rb.status} ${rb.data?.gp_sync?.status ?? rb.error?.message} · 필요 ${anc?.required_fund_amount / 억}억 · 남은 ${anc?.remaining_amount / 억}억`);
  }

  // ── 4. 결성
  phase('4. 결성 · LP 결성 확인');
  const ss = (await commitments()).find((c) => c.fund_name.startsWith('새솔'));
  const badConfirm = await off('POST', `/commitments/${ss.id}/confirm`, { commitment_amount: 400 * 억, fund_size_amount: 300 * 억, formation_date: '2026-10-02' });
  check('Q4-1 ⛔', '약정액 > 결성액 → 400', badConfirm.status === 400, `${badConfirm.status} ${badConfirm.error?.code ?? ''}`);
  const confirm = await off('POST', `/commitments/${ss.id}/confirm`, { commitment_amount: 100 * 억, fund_size_amount: 300 * 억, formation_date: '2026-10-02' });
  const ssAfter = (await off('GET', `/commitments/${ss.id}`)).data;
  check('Q4-2', '새솔 결성 확인 → 활성 · 약정 100억 · 조합 결성', confirm.status === 200 && ssAfter.status === 'active' && ssAfter.commitment_amount === 100 * 억 && ['formed', 'operating'].includes(ssAfter.fund_status), `${confirm.status} ${confirm.error?.message ?? ''} · ${ssAfter.status} · ${ssAfter.commitment_amount / 억}억 · ${ssAfter.fund_status}`);
  const totals = async () => (await off('GET', `/commitments/${L.id}/ledger`)).data.totals;
  const t0 = (await totals()).find((x) => x.entry_type === 'commitment');
  check('Q4-3 🔗', '연동 조합 약정 대사 일치 50억', t0.recon?.recon_status === 'matched' && t0.our_amount === 50 * 억 && t0.gp_amount === 50 * 억, `${t0.our_amount / 억} / ${t0.gp_amount / 억} ${t0.recon?.recon_status}`);

  // ── 5. 캐피탈콜
  phase('5. GP · 캐피탈콜 → LP 납입 → 대사');
  const gCall = await gp('POST', `/funds/${gL.id}/capital-calls`, { total_call_amount: 15 * 억, call_all_unfunded: false, call_date: today, due_date: '2026-11-16', purpose: 'QA 제5차 출자' });
  const gIssue = gCall.data?.id ? await gp('POST', `/funds/${gL.id}/capital-calls/${gCall.data.id}/issue`, {}) : { status: 0 };
  const gItem = (gIssue.data?.items ?? []).find((i) => (i.member_name ?? i.lp_name ?? '').includes('하늘'));
  check('Q5-1', 'GP 5회 콜 작성 · 발송, 하늘 몫 5억', gCall.status === 201 && gIssue.status === 200 && Number(gItem?.call_amount) === 5 * 억, `${gCall.status}/${gIssue.status} ${gCall.error?.message ?? gIssue.error?.message ?? ''} · 하늘 ${Number(gItem?.call_amount) / 억}억`);
  const lpCall = await poll(async () => list(await off('GET', '/capital-calls?status=all')).find((c) => c.commitment_id === L.id && c.call_no === gCall.data?.call_no), Boolean);
  check('Q5-2 🔗', 'LP 5회 콜 수신 (웹훅) · 금액 · 기한', lpCall && lpCall.call_amount === 5 * 억 && lpCall.due_date === '2026-11-16', lpCall ? `${lpCall.call_no}회 ${lpCall.call_amount / 억}억 기한 ${lpCall.due_date}` : '안 들어옴');
  const over = await off('POST', `/capital-calls/${lpCall.id}/payments`, { amount: 6 * 억 });
  check('Q5-3 ⛔', '남은 금액보다 큰 납입 기안 거부', over.status >= 400 && over.status < 500, `${over.status} ${over.error?.code ?? ''}`);
  const pay = await off('POST', `/capital-calls/${lpCall.id}/payments`, { amount: 5 * 억 });
  await apr('POST', `/approvals/${pay.data.approval_id}/approve`, { decision_comment: null });
  const key = crypto.randomUUID();
  const paid1 = await off('POST', `/payments/${pay.data.payment.id}/mark-paid`, { paid_date: today }, key);
  const ourAfter1 = (await totals()).find((x) => x.entry_type === 'contribution').our_amount;
  check('Q5-4', '납입 기안 → 승인 → 송금 기록', paid1.status === 200 && ourAfter1 === 35 * 억, `${paid1.status} · 우리 납입 ${ourAfter1 / 억}억`);
  const paid2 = await off('POST', `/payments/${pay.data.payment.id}/mark-paid`, { paid_date: today }, key);
  const ourAfter2 = (await totals()).find((x) => x.entry_type === 'contribution').our_amount;
  check('Q5-5 ⛔', '같은 Idempotency-Key 두 번 → 한 번만', paid2.status === 200 && ourAfter2 === ourAfter1, `${paid2.status} · 우리 납입 ${ourAfter2 / 억}억`);
  const c1 = (await totals()).find((x) => x.entry_type === 'contribution');
  check('Q5-6 🔗', 'GP 입금 전: 불일치 · 확인 대기', c1.recon?.recon_status === 'mismatched' && c1.recon.waiting, `${c1.our_amount / 억} / ${c1.gp_amount / 억} ${c1.recon?.recon_status}`);
  const gPay = await gp('POST', `/funds/${gL.id}/capital-calls/${gCall.data.id}/items/${gItem.id}/payments`, { paid_amount: 5 * 억, paid_date: today, memo: 'QA 입금 확인' });
  const c2 = await poll(async () => (await totals()).find((x) => x.entry_type === 'contribution'), (t) => t.recon?.recon_status === 'matched');
  check('Q5-7 🔗', 'GP 입금 기록 → LP 납입 대사 일치', gPay.status === 201 && c2.recon?.recon_status === 'matched' && c2.gp_amount === 35 * 억, `${gPay.status} · ${c2.our_amount / 억} / ${c2.gp_amount / 억} ${c2.recon?.recon_status}`);

  // ── 6. 사후관리
  phase('6. 사후관리 · 공지 · 보고 · 총회');
  const title = `QA 공지 ${Date.now()}`;
  const gNotice = await gp('POST', `/funds/${gL.id}/notices`, { title, body: 'QA 시나리오용 일반 공지입니다.', lp_ids: [] });
  const gSend = await gp('POST', `/funds/${gL.id}/notices/${gNotice.data?.id}/send`, {});
  const lpNotice = await poll(async () => list(await off('GET', '/notices?box=all')).find((n) => n.title === title), Boolean);
  check('Q6-1 🔗', 'GP 공지 발송 → LP 통지함 수신', gNotice.status === 201 && gSend.status === 200 && lpNotice, `${gNotice.status}/${gSend.status} · LP ${lpNotice ? '수신' : '없음'}`);
  const ack = lpNotice ? await off('POST', `/notices/${lpNotice.id}/acknowledge`, {}) : { status: 0 };
  // GP 공지는 목록에 수신자별 확인 시각이 있다 (상세 GET 없음)
  const gN = await poll(async () => (await gp('GET', `/funds/${gL.id}/notices`)).data.notices.find((n) => n.id === gNotice.data.id), (n) => (n?.recipients ?? []).find((r) => r.lp_name === '하늘연금')?.acknowledged_at);
  const ackAt = (gN?.recipients ?? []).find((r) => r.lp_name === '하늘연금')?.acknowledged_at;
  check('Q6-2 🔗', 'LP 받음 확인 → GP 확인 시각', ack.status === 200 && ackAt, `${ack.status} gp_sync ${ack.data?.gp_sync?.status} · GP ${ackAt ?? '미확인'}`);
  const rep = list(await off('GET', '/reports')).find((r) => r.fund_name.startsWith('LP연동') && r.period_end === '2026-06-30');
  check('Q6-3 🔗', 'GP Q2 보고 수신 · 우리 몫 평가액', rep && rep.data_source === 'gp_api' && rep.nav_amount > 0, rep ? `${rep.data_source} · 평가액 ${(rep.nav_amount / 억).toFixed(2)}억` : '없음');
  const rv = rep ? await off('POST', `/reports/${rep.id}/review`, {}) : { status: 0 };
  const alertsAfter = (await off('GET', '/dashboard')).data.alerts;
  check('Q6-4', '보고 검토 완료 → 주의 목록에서 빠짐', rv.status === 200 && !alertsAfter.some((a) => a.key === 'reports_unreviewed'), `${rv.status} · 주의 ${alertsAfter.map((a) => a.key).join(',')}`);
  const mt = list(await off('GET', '/meetings?box=all')).find((m) => m.fund_name.startsWith('LP연동') && m.meeting_date === '2026-10-30');
  const md = (await off('GET', `/meetings/${mt.id}`)).data;
  await off('PUT', `/meetings/${mt.id}/votes`, { votes: md.agendas.map((a) => ({ agenda_id: a.id, choice: 'for', review_opinion: 'QA 검토 찬성' })) });
  const va = await off('POST', `/meetings/${mt.id}/vote-approvals`, { request_comment: 'QA 투표' });
  await apr('POST', `/approvals/${va.data?.approval_id ?? va.data?.approval?.id}/approve`, { decision_comment: null });
  const gM = (await gp('GET', `/funds/${gL.id}/meetings`)).data.meetings.find((m) => m.meeting_date === '2026-10-30');
  const gMd = (await gp('GET', `/funds/${gL.id}/meetings/${gM.id}`)).data;
  const voter = gMd.voters.find((v) => v.name === '하늘연금');
  const allDirect = gMd.agendas.every((a) => a.lp_direct.includes(voter.member_id) && a.votes[voter.member_id] === 'for');
  check('Q6-5 🔗', 'LP 투표 결재 → GP 두 안건 LP 직접 찬성', allDirect, gMd.agendas.map((a) => `${a.lp_direct.includes(voter.member_id) ? 'LP 직접' : '-'} ${a.votes[voter.member_id] ?? '미투표'}`).join(' / '));

  // ── 7. 분배
  phase('7. GP · 분배 → LP 수령 → 대사');
  const dists = async () => list(await off('GET', `/distributions?commitment_id=${L.id}&status=all`));
  const d2 = (await dists()).find((d) => d.status === 'announced');
  const gDist = (await gp('GET', `/funds/${gL.id}/distributions`)).data.items.find((x) => x.distribution_no === 2);
  check('Q7-1 🔗', 'GP 2차 확정 → LP 수령 대기', d2 && d2.distribution_no === 2 && gDist?.status === 'confirmed', d2 ? `LP ${d2.distribution_no}회 ${(d2.amount / 억).toFixed(2)}억 ${d2.status} · GP ${gDist?.status}` : '없음');
  const gsql = await gpDemoSql();
  await gsql`update distributions set distribution_date = ${today} where id = ${gDist.id} and status = 'confirmed'`;
  await gsql.end();
  const gPaid = await gp('POST', `/funds/${gL.id}/distributions/${gDist.id}/pay`, {});
  const d2b = await poll(async () => (await dists()).find((d) => d.id === d2.id), (d) => d.gp_status === 'paid');
  const dr = (await totals()).find((x) => x.entry_type === 'distribution');
  check('Q7-2 🔗', 'GP 지급 → LP "GP 지급됨" · 분배 대사 확인 대기', gPaid.status === 200 && d2b.gp_status === 'paid' && dr.recon?.recon_status === 'mismatched' && dr.recon.waiting, `${gPaid.status} ${gPaid.error?.message ?? ''} · ${d2b.gp_status} · ${dr.our_amount / 억}/${(dr.gp_amount / 억).toFixed(2)} ${dr.recon?.recon_status}`);
  const future = await off('POST', `/distributions/${d2.id}/receive`, { received_date: '2026-12-31' });
  check('Q7-3 ⛔', '미래 수령일 거부', future.status >= 400 && future.status < 500, `${future.status} ${future.error?.code ?? ''}`);
  const recv = await off('POST', `/distributions/${d2.id}/receive`, { received_date: today });
  const dr2 = (await totals()).find((x) => x.entry_type === 'distribution');
  const alerts2 = (await off('GET', '/dashboard')).data.alerts;
  check('Q7-4 🔗', '수령 기록 → 분배 대사 일치 · 주의 목록에서 빠짐', recv.status === 200 && dr2.recon?.recon_status === 'matched' && !alerts2.some((a) => a.key === 'distributions'), `${(dr2.our_amount / 억).toFixed(2)} / ${(dr2.gp_amount / 억).toFixed(2)} ${dr2.recon?.recon_status}`);

  // ── 8. 성과
  phase('8. 성과 · 대시보드');
  const dd = (await off('GET', '/dashboard')).data.portfolio;
  const pf = (await off('GET', '/performance')).data.total;
  check('Q8-1', '대시보드 = 성과 화면', ['tvpi', 'contribution_amount', 'distribution_amount', 'nav_amount'].every((k) => dd[k] === pf[k]), `TVPI ${pf.tvpi} · 납입 ${pf.contribution_amount / 억}억 · ${pf.count}건`);
  let numbersOk = false;
  let numbersOut = '';
  try {
    numbersOut = execSync('node --env-file=.env.local scripts/check-numbers.mjs --demo', { encoding: 'utf8' });
    numbersOk = true;
  } catch (e) { numbersOut = String(e.stdout ?? e.message); }
  check('Q8-2', '숫자 일치 점검 (배포 데모 DB)', numbersOk, numbersOut.trim().split('\n').pop());

  // ── 9. 청산
  phase('9. 청산');
  const H = (await commitments()).find((c) => c.fund_name.startsWith('한결'));
  await off('POST', `/funds/${H.fund_id}/status`, { status: 'liquidated' });
  const early = await off('POST', `/commitments/${H.id}/close`, { closed_date: today });
  check('Q9-1 ⛔', '미납 콜 있는 채 청산 → 422', early.status === 422 && (early.error?.details?.checks ?? []).some((c) => !c.ok && c.label.includes('캐피탈콜')), `${early.status} ${early.error?.code ?? ''}`);
  const hc = list(await off('GET', '/capital-calls?status=unpaid')).find((c) => c.commitment_id === H.id);
  const hp = await off('POST', `/capital-calls/${hc.id}/payments`, { amount: hc.call_amount });
  await apr('POST', `/approvals/${hp.data.approval_id}/approve`, { decision_comment: null });
  await off('POST', `/payments/${hp.data.payment.id}/mark-paid`, { paid_date: today });
  const closed = await off('POST', `/commitments/${H.id}/close`, { closed_date: today });
  check('Q9-2', '남은 콜 납입 → 청산 · 최종 성과 고정', closed.status === 200 && closed.data?.status === 'closed' && closed.data?.final_metrics?.contribution_amount === 20 * 억, `${closed.status} · ${closed.data?.status} · 납입 ${closed.data?.final_metrics?.contribution_amount / 억}억`);
  const newCall = await off('POST', `/commitments/${H.id}/capital-calls`, { call_no: 9, call_date: today, call_amount: 억, due_date: '2026-12-01' });
  check('Q9-3 ⛔', '청산된 출자 건에 새 콜 → 409', newCall.status === 409, `${newCall.status} ${newCall.error?.code ?? ''}`);

  // ── 10. 공통
  phase('10. 공통 안전장치');
  const budgetId = (await off('GET', '/dashboard')).data.budget.id;
  const paths = [`/commitments/${L.id}`, `/proposals/${dt.id}`, `/budgets/${budgetId}`, `/capital-calls/${lpCall.id}`];
  const leaks = await Promise.all(paths.map((p) => bOff('GET', p).then((x) => x.status)));
  check('Q10-1 ⛔', '바다에서 하늘 데이터 → 404', leaks.every((s) => s === 404), leaks.join(','));
  const inboxBefore = (await adm("GET", "/integration")).data.counts;
  const forged = await fetch(`${LP}/api/webhooks/gp/${conn.gp_connection_id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-gp-event-id': crypto.randomUUID(), 'x-gp-signature': 'sha256=deadbeef', 'x-gp-timestamp': String(Math.floor(Date.now() / 1000)) },
    body: JSON.stringify({ event_type: 'fund.updated', data: {} }),
  });
  const inboxAfter = (await adm("GET", "/integration")).data.counts;
  const total = (x) => Object.values(x ?? {}).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
  check('Q10-2 ⛔🔗', '서명 위조 웹훅 → 401 · 저장 안 됨', forged.status === 401 && total(inboxAfter) === total(inboxBefore), `${forged.status} · 인박스 ${total(inboxBefore)} → ${total(inboxAfter)}`);
  const pull = await adm('POST', '/integration/pull', {});
  const failed = (await adm("GET", "/integration")).data.counts?.failed ?? 0;
  check('Q10-3 🔗', '지금 가져오기 → 200 · 실패 0', pull.status === 200 && failed === 0, `${pull.status} · 실패 ${failed}`);
  const pages = ['/', '/approvals', '/board', '/capital-calls', '/distributions', '/cash-plan', '/notices', '/reports', '/meetings', '/proposals', '/programs', '/budgets', '/commitments', '/performance', '/funds', '/gps', '/users', '/integration', '/evaluation-criteria', '/audit-logs'];
  const codes = await Promise.all(pages.map((p) => fetch(LP + p, { headers: { cookie: adm.cookie }, redirect: 'manual' }).then((r) => r.status)));
  const bad = pages.filter((_, i) => codes[i] !== 200);
  check('Q10-4', `LP 메뉴 화면 ${pages.length}개 → 200`, bad.length === 0, bad.length ? `실패 ${bad.join(', ')}` : '모두 200');
} catch (err) {
  check('ERR', `${current} 진행 중 오류로 멈춤`, false, err.stack?.split('\n').slice(0, 2).join(' '));
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed === results.length ? '✔' : '✖'} ${passed}/${results.length} 통과`);
for (const r of results.filter((x) => !x.ok)) console.log(`  ✕ ${r.id} ${r.label} — ${r.detail}`);
fs.writeFileSync(new URL('../.qa-result.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), passed, total: results.length, results }, null, 2));

if (process.argv.includes('--reset')) {
  console.log('\n데모 되돌리기: GP → LP 짝 맞춘 갱신');
  // node --env-file 은 이미 있는 환경 변수를 덮어쓰지 않는다. LP 값(NEON_API_KEY 등)을 빼고 넘겨야 GP 갱신이 GP 프로젝트를 고친다
  const lpKeys = Object.keys(readEnv(new URL('../.env.local', import.meta.url)));
  const gpEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !lpKeys.includes(k)));
  const gpOut = execSync('npm run db:demo-refresh -- --prune-backups', { cwd: new URL('../../gp/', import.meta.url), env: gpEnv, encoding: 'utf8' });
  if (!gpOut.includes('✔ 데모 DB를 새로 고쳤습니다')) throw new Error('GP 데모 갱신 실패 — LP 갱신을 하지 않습니다');
  execSync('npm run db:demo-refresh -- --prune-backups', { encoding: 'utf8' });
  console.log('✔ 배포 데모를 처음 상태로 되돌렸습니다');
}
process.exitCode = passed === results.length ? 0 : 1;
