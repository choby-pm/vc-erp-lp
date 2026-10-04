// 배포 데모 DB 두 개(GP · LP)를 데모 원본(demo-seed)으로 되돌린다 — 매일 03:00 주기 작업(lib/services/demo.ts)과 같은 복원
//
//   node scripts/demo-restore.mjs     QA 자동 실행(.github/workflows/qa.yml)이 QA 앞뒤로 부른다
//
// db:demo-refresh 와 다르다: main(개발 DB)을 복사하지 않고, 이미 있는 데모 원본으로만 되돌린다
// 값: .env.local 과 ../gp/.env.local 의 NEON_API_KEY · NEON_PROJECT_ID · DEMO_BRANCH_ID · DEMO_SEED_BRANCH_ID
import fs from 'node:fs';

const NEON_API = 'https://console.neon.tech/api/v2';
const readEnv = (file) => Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]));

async function restore(name, e) {
  for (const k of ['NEON_API_KEY', 'NEON_PROJECT_ID', 'DEMO_BRANCH_ID', 'DEMO_SEED_BRANCH_ID']) if (!e[k]) throw new Error(`${name}: ${k} 가 없습니다`);
  const headers = { Authorization: `Bearer ${e.NEON_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  const base = `${NEON_API}/projects/${e.NEON_PROJECT_ID}`;
  const res = await fetch(`${base}/branches/${e.DEMO_BRANCH_ID}/restore`, { method: 'POST', headers, body: JSON.stringify({ source_branch_id: e.DEMO_SEED_BRANCH_ID }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${name} 데모 복원 실패 (HTTP ${res.status}): ${json.message ?? ''}`);
  // 복원 작업이 끝날 때까지 기다린다 (보통 몇 초)
  for (const op of json.operations ?? []) {
    for (let i = 0; i < 60; i++) {
      const s = (await (await fetch(`${base}/operations/${op.id}`, { headers })).json()).operation?.status;
      if (s === 'finished' || s === 'skipped') break;
      if (s === 'failed' || s === 'error') throw new Error(`${name} 데모 복원 작업 실패 (${op.action})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.log(`✔ ${name} 데모를 원본으로 되돌렸습니다`);
}

await restore('GP', readEnv(new URL('../../gp/.env.local', import.meta.url)));
await restore('LP', readEnv(new URL('../.env.local', import.meta.url)));
