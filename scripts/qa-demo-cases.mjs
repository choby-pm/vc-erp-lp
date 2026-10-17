// 로그인·역할·기관 분리만 검사한다. 업무 기록은 변경하지 않는다. 브라우저 QA와 별도다.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const bases={gp:process.env.QA_GP_URL??'https://vc-erp-gp.vercel.app',lp:process.env.QA_LP_URL??'https://vc-erp-lp.vercel.app'};
const results=[];
const cases=['start','complete','continue'];
function check(label,ok){results.push({label,ok:Boolean(ok)});console.log(`${ok?'✓':'✕'} ${label}`);}
async function call(base,path,body,cookie){
 const r=await fetch(base+'/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,json:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
const commitmentIds={};
for(const key of cases) for(const role of ['officer','approver','admin']) {
 let cookie;
 try {
  const login=await call(bases.lp,'/auth/demo-login',{org:key,role});cookie=login.cookie;
  check(`LP ${key}/${role} 로그인`,login.status===200&&cookie);
  if(!cookie)continue;
  const me=await call(bases.lp,'/auth/me',undefined,cookie);
  check(`LP ${key}/${role} 계정`,me.status===200&&me.json.data.email===`${role}@${key}.demo.lp-erp.dev`&&me.json.data.role===role);
  const commitments=await call(bases.lp,'/commitments',undefined,cookie);
  const rows=Array.isArray(commitments.json.data)?commitments.json.data:Object.values(commitments.json.data??{}).find(Array.isArray)??[];
  check(`LP ${key}/${role} 시작 상태`,commitments.status===200&&(key==='start'?rows.length===0:rows.length===1&&rows[0].status===(key==='complete'?'closed':'active')));
  if(rows[0])commitmentIds[key]=rows[0].id;
 } finally {if(cookie)await call(bases.lp,'/auth/logout',{},cookie);}
}
for(const key of cases) for(const role of ['author','reviewer']) {
 let cookie;
 try {
  const login=await call(bases.gp,'/auth/demo-login',{case:key,role});cookie=login.cookie;
  check(`GP ${key}/${role} 로그인`,login.status===200&&cookie);
  if(!cookie)continue;
  const me=await call(bases.gp,'/auth/me',undefined,cookie);
  check(`GP ${key}/${role} 계정`,me.status===200&&me.json.data.email===`${key}.${role}@demo.gp-erp.dev`&&me.json.data.role==='admin');
  check(`GP ${key}/${role} 시작 경로`,typeof login.json.data.next==='string'&&(key==='start'?['/funds','/funds/new'].includes(login.json.data.next):/^\/funds\/[0-9a-f-]{36}$/.test(login.json.data.next)));
 } finally {if(cookie)await call(bases.gp,'/auth/logout',{},cookie);}
}
for(const key of cases){
 const login=await call(bases.lp,'/auth/demo-login',{org:key,role:'officer'});
 try{
  for(const other of ['complete','continue'].filter(k=>k!==key)){
   assert.ok(commitmentIds[other]);
   const r=await call(bases.lp,`/commitments/${commitmentIds[other]}`,undefined,login.cookie);
   check(`LP ${key} → ${other} 접근 차단`,[403,404].includes(r.status));
  }
 }finally{await call(bases.lp,'/auth/logout',{},login.cookie);}
}
for(const [repo,body] of [['gp',{case:'other'}],['gp',{case:'start',role:'owner'}],['lp',{org:'other',role:'admin'}],['lp',{org:'start',role:'owner'}]]){
 const r=await call(bases[repo],'/auth/demo-login',body);
 check(`${repo.toUpperCase()} 잘못된 케이스·역할 거절`,r.status===400);
}
const report={at:new Date().toISOString(),type:'API QA',passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results};
fs.writeFileSync('.qa-demo-cases.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({type:report.type,passed:report.passed,failed:report.failed}));
assert.equal(report.failed,0);
