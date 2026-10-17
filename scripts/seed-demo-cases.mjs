// GP가 출력한 가상 체험 스냅샷을 demo-seed에 반영한다. 실제 API QA와 구분한다.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createJiti} from 'jiti';
assert.ok(process.env.REVIEW_DEMO_BRANCH_ID && process.env.APP_DATABASE_URL && process.env.REVIEW_CASE_EXPORT);
assert.equal(process.env.REVIEW_DEMO_BRANCH_ID,process.env.DEMO_SEED_BRANCH_ID);
assert.notEqual(process.env.NODE_ENV,'production');
const q=new URLSearchParams({branch_id:process.env.DEMO_SEED_BRANCH_ID,database_name:process.env.PGDATABASE,role_name:process.env.PGUSER,pooled:'false'});
const check=await fetch(`https://console.neon.tech/api/v2/projects/${process.env.NEON_PROJECT_ID}/connection_uri?${q}`,{headers:{Authorization:`Bearer ${process.env.NEON_API_KEY}`}});assert.ok(check.ok);
assert.equal(new URL(process.env.APP_DATABASE_URL).host,new URL((await check.json()).uri).host);
const fixture=JSON.parse(fs.readFileSync(process.env.REVIEW_CASE_EXPORT,'utf8'));
assert.deepEqual(fixture.cases.map(c=>c.key),['start','complete','continue']);
const jiti=createJiti(import.meta.url,{alias:{'@':path.resolve('.')}});
const {sql}=await jiti.import('@/lib/db.ts');
const {hashPassword}=await jiti.import('@/lib/auth/password.ts');
const {DEMO_ORGS,DEMO_ROLES,demoEmail}=await jiti.import('@/lib/auth/demo.ts');
const {initialSync}=await jiti.import('@/lib/gp/sync.ts');
const {receiveDistribution}=await jiti.import('@/lib/services/distributions.ts');
const {closeCommitment}=await jiti.import('@/lib/services/closing.ts');
const {importPastPayments}=await jiti.import('@/lib/services/imported-payments.ts');
const {requestPayment}=await jiti.import('@/lib/services/payments.ts');
const originalFetch=globalThis.fetch;
const result=[];
let stage='setup';
try {
 const before=await sql`select id,amount,entry_type,entry_date from ledger_entries order by id`;
 const [connection]=await sql`select id,base_url_env,api_key_env from gp_connections where name='VC ERP (GP) 데모'`;
 assert.ok(connection);
 // 외부 통신 없이 GP 원본에서 내보낸 공개 응답을 기존 수신 서비스로 읽는다.
 process.env[connection.base_url_env]='https://review-seed.invalid';
 process.env[connection.api_key_env]='snapshot-only';
 globalThis.fetch=async (input,init)=>{
  const url=new URL(typeof input==='string'?input:input.url);
  assert.equal(url.origin,'https://review-seed.invalid','시드 중 외부 업무 요청은 보내지 않습니다');
  assert.equal(init?.method??'GET','GET');
  assert.ok(Object.hasOwn(fixture.routes,url.pathname),`스냅샷 경로 누락: ${url.pathname}`);
  return Response.json({data:fixture.routes[url.pathname]});
 };
 for(const c of fixture.cases) {
  stage=`${c.key}:accounts`;
  const org=DEMO_ORGS[c.key];assert.ok(org);
  const users={};let gpId;
  await sql.begin(async tx=>{
   await tx`insert into orgs(id,name,org_type) values(${org.id},${org.name},${org.org_type}) on conflict do nothing`;
   for(const role of DEMO_ROLES) {
    const email=demoEmail(c.key,role);
    const name={start:{officer:'김서아',approver:'이도윤',admin:'박하준'},complete:{officer:'최지안',approver:'정서준',admin:'한수빈'},continue:{officer:'윤하린',approver:'강지호',admin:'서예린'}}[c.key][role];
    let [u]=await tx`select id,role,org_id from users where email=${email} and disabled_at is null`;
    if(!u) [u]=await tx`insert into users(org_id,email,name,role,password_hash) values(${org.id},${email},${name},${role},${await hashPassword(randomBytes(32).toString('base64url'))}) returning id,role,org_id`;
    else await tx`update users set name=${name} where id=${u.id} and org_id=${org.id}`;
    assert.equal(u.org_id,org.id);assert.equal(u.role,role);users[role]=u.id;
   }
   let [gp]=await tx`select id from gps where org_id=${org.id} and gp_connection_id=${connection.id}`;
   if(!gp) [gp]=await tx`insert into gps(org_id,name,gp_type,gp_connection_id,created_by) values(${org.id},'VC ERP 데모 운용사','venture_capital',${connection.id},${users.admin}) returning id`;
   gpId=gp.id;
   await tx`insert into gp_lp_links(org_id,gp_id,gp_connection_id,gp_lp_id) values(${org.id},${gp.id},${connection.id},${c.lp_id}) on conflict do nothing`;
   const [link]=await tx`select gp_lp_id from gp_lp_links where org_id=${org.id} and gp_id=${gp.id}`;assert.equal(link.gp_lp_id,c.lp_id);
   if(!(await tx`select id from evaluation_criteria where org_id=${org.id}`).length) for(const [i,name] of ['운용 인력','운용 성과','투자 전략','조합 조건'].entries()) await tx`insert into evaluation_criteria(org_id,name,weight_ratio,sort_order) values(${org.id},${name},0.25,${i})`;
  });
  stage=`${c.key}:sync`;
  await initialSync(org.id,gpId);
  if(c.key==='start') {
   assert.equal((await sql`select count(*)::int as n from funds where org_id=${org.id}`)[0].n,0);
   assert.equal((await sql`select count(*)::int as n from commitments where org_id=${org.id}`)[0].n,0);
   result.push({key:c.key,org_id:org.id,funds:0,commitments:0});continue;
  }
  const [fund]=await sql`select id,status from funds where org_id=${org.id} and gp_fund_id=${c.fund_id}`;assert.ok(fund);
  let [commitment]=await sql`select id,status from commitments where org_id=${org.id} and fund_id=${fund.id}`;assert.ok(commitment);
  if(c.key==='complete' && commitment.status==='awaiting_formation') {
   // 이미 청산된 가상 과거 조합: 결성 시점 장부를 복원한 뒤 기존 과거 납입 가져오기를 적용한다.
   await sql.begin(async tx=>{
    await tx`update commitments set origin='imported',proposal_id=null,status='active',confirmed_date='2026-06-01' where id=${commitment.id} and org_id=${org.id}`;
    await tx`insert into ledger_entries(org_id,commitment_id,entry_type,amount,entry_date,source_type,source_id,memo) select ${org.id},${commitment.id},'commitment',1900000000,'2026-05-10','commitment_confirmation',${commitment.id},'결성 확인' where not exists(select 1 from ledger_entries where commitment_id=${commitment.id} and entry_type='commitment')`;
   });
   await initialSync(org.id,gpId);
   await importPastPayments(org.id,commitment.id);
   [commitment]=await sql`select id,status from commitments where id=${commitment.id}`;
  }
  stage=`${c.key}:history`;
  await sql.begin(async tx=>{
   let [budget]=await tx`select id from budgets where org_id=${org.id} and budget_year=2026`;
   if(!budget) {
    [budget]=await tx`insert into budgets(org_id,budget_year,total_amount,created_by) values(${org.id},2026,2000000000,${users.admin}) returning id`;
    await tx`insert into budget_allocations(org_id,budget_id,strategy,amount) values(${org.id},${budget.id},'early',2000000000)`;
   }
   let [proposal]=await tx`select id from proposals where org_id=${org.id} and fund_id=${fund.id}`;
   if(!proposal) {
    const gpProposal=fixture.routes[`/lps/${c.lp_id}/proposals`].find(p=>p.fund.id===c.fund_id);assert.ok(gpProposal);
    [proposal]=await tx`insert into proposals(org_id,gp_id,fund_id,proposal_channel,requested_amount,received_date,status,decided_date,data_source,gp_proposal_id,gp_response_sent_at,created_by) values(${org.id},${gpId},${fund.id},'direct',1900000000,'2026-05-01','selected','2026-05-10','gp_api',${gpProposal.id},'2026-05-10T03:00:00Z',${users.officer}) returning id`;
    let from=null;
    for(const to of ['received','screening','due_diligence','presentation','committee','selected']) {
     await tx`insert into proposal_stage_history(org_id,proposal_id,from_status,to_status,note,changed_by,changed_at) values(${org.id},${proposal.id},${from},${to},'과거 가상 심사 기록',${to==='selected'?users.approver:users.officer},'2026-05-10T03:00:00Z')`;from=to;
    }
    const [evaluation]=await tx`insert into evaluations(org_id,proposal_id,evaluator_id,stage,evaluated_date,opinion) values(${org.id},${proposal.id},${users.officer},'committee','2026-05-09','투자 전략과 운용 역량 확인') returning id`;
    for(const criterion of await tx`select id,name,weight_ratio from evaluation_criteria where org_id=${org.id}`) await tx`insert into evaluation_scores(org_id,evaluation_id,criterion_id,criterion_name,weight_ratio,score) values(${org.id},${evaluation.id},${criterion.id},${criterion.name},${criterion.weight_ratio},85)`;
    await tx`insert into selection_terms(org_id,proposal_id,budget_id,planned_amount,max_commitment_ratio,formation_deadline,key_person_condition,locked_at,created_by) values(${org.id},${proposal.id},${budget.id},1900000000,1,'2026-06-30','대표펀드매니저 유지','2026-05-10T03:00:00Z',${users.officer})`;
    const snapshot={proposal:{fund_name:fixture.routes[`/lps/${c.lp_id}/funds/${c.fund_id}`].fund.name,gp_name:'VC ERP 데모 운용사',requested_amount:1900000000,channel:'direct',received_date:'2026-05-01'},terms:{budget_year:2026,planned_amount:1900000000,max_commitment_ratio:1,formation_deadline:'2026-06-30',key_person_condition:'대표펀드매니저 유지'},numbers:{evaluation_count:1,avg_score:85},warnings:[]};
    await tx`insert into approvals(org_id,target_type,target_id,status,requested_by,requested_at,request_comment,snapshot,approver_id,decided_at,decision_comment) values(${org.id},'selection',${proposal.id},'approved',${users.officer},'2026-05-09T03:00:00Z','선정 승인 요청',${tx.json(snapshot)},${users.approver},'2026-05-10T03:00:00Z','선정 조건 확인 후 승인')`;
   }
   await tx`update commitments set proposal_id=${proposal.id},origin='selection',confirmed_date='2026-06-01' where id=${commitment.id} and org_id=${org.id}`;
  });
  if(c.key==='complete' && commitment.status!=='closed') {
   stage='complete:receipt';
   for(const d of await sql`select id from distributions where org_id=${org.id} and commitment_id=${commitment.id} and status='announced'`) await receiveDistribution(org.id,users.officer,d.id,{received_date:fixture.routes[`/lps/${c.lp_id}/funds/${c.fund_id}/distributions`][0].distribution_date});
   await sql`update reports set reviewed_at=coalesce(reviewed_at,now()),reviewed_by=coalesce(reviewed_by,${users.officer}) where org_id=${org.id} and fund_id=${fund.id}`;
   stage='complete:close';await closeCommitment(org.id,commitment.id,null);
  }
  const [state]=await sql`select status,final_metrics from commitments where id=${commitment.id}`;
  assert.equal(state.status,c.key==='complete'?'closed':'active');
  if(c.key==='complete') assert.ok(state.final_metrics && state.final_metrics.distribution_amount>0);
  if(c.key==='continue') {
   const [call]=await sql`select id from capital_calls where commitment_id=${commitment.id} and call_no=2 and cancelled_at is null`;assert.ok(call);
   let [payment]=await sql`select id,status from payments where capital_call_id=${call.id} and status in ('requested','approved','paid')`;
   if(!payment) {
    await requestPayment(org.id,users.officer,call.id,{amount:19000,planned_date:'2026-10-17',request_comment:'추가 투자 재원 납입 승인 요청'});
    [payment]=await sql`select id,status from payments where capital_call_id=${call.id} and status='requested'`;
   }
   assert.equal(payment?.status,'requested','중간 케이스는 납입 승인 대기 상태여야 합니다');
   assert.equal((await sql`select count(*)::int as n from approvals where target_type='payment' and target_id=${payment.id} and status='pending'`)[0].n,1);
  }
  result.push({key:c.key,org_id:org.id,fund_id:fund.id,commitment_id:commitment.id,status:state.status});
 }
 assert.deepEqual(await sql`select id,amount,entry_type,entry_date from ledger_entries where id in ${sql(before.map(r=>r.id))} order by id`,before);
 console.log(JSON.stringify({cases:result,existingLedgerPreserved:true,source:'GP demo-seed snapshot; not API QA'}));
}catch(e){console.error(JSON.stringify({failed:true,stage,code:e.code??'CHECK_FAILED',message:String(e.message).split('\n')[0]}));process.exitCode=1;}
finally{globalThis.fetch=originalFetch;await sql.end();}
