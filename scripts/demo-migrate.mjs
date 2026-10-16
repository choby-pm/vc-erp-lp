// 데모 DB에 마이그레이션만 적용 (데모 데이터는 그대로) — 2026-10-17부터 데모 반영의 기본 절차
//
// db:demo-refresh 는 개발 DB(main)를 통째로 데모 원본에 복사해, 개발·검증 데이터가 공개 데모에 들어간다.
// 이 스크립트는 데모 원본(demo-seed)의 데이터를 유지하고 스키마만 올린다. GP 먼저 → 바로 LP (L23 짝 맞춤).
//   1) demo ← demo-seed        오늘 데모 사용 흔적을 지우고 원본 상태로
//   2) demo 에 db/migrations 적용 (scripts/migrate.mjs)
//   3) demo-seed ← demo        마이그레이션된 상태를 새 원본으로 (이전 원본은 demo-seed-backup-* 로 보존)
//   4) demo ← demo-seed        브랜치 관계를 demo-seed → demo 로 되돌린다. 안 하면 매일 03:00 복원이 "Branch has children"으로 실패한다
//
// 사용법: npm run db:demo-migrate            (상태만 보기: npm run db:demo-migrate -- status)
import { execFileSync } from 'node:child_process';

const { NEON_API_KEY, NEON_PROJECT_ID, DEMO_BRANCH_ID, DEMO_SEED_BRANCH_ID, PGDATABASE, PGUSER } = process.env;
for (const [k, v] of Object.entries({ NEON_API_KEY, NEON_PROJECT_ID, DEMO_BRANCH_ID, DEMO_SEED_BRANCH_ID, PGDATABASE, PGUSER })) if (!v) throw new Error(`${k} 가 .env.local 에 필요합니다`);

const api = (path, body) =>
  fetch(`https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${NEON_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${path} 실패 (HTTP ${r.status}): ${j.message ?? ''}`);
    return j;
  });

async function waitIdle() {
  for (let i = 0; i < 90; i++) {
    const { operations } = await api('/operations?limit=10');
    if (!operations.some((o) => ['scheduling', 'running'].includes(o.status))) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Neon 작업이 끝나지 않았습니다');
}

// 하위 브랜치가 있으면 Neon이 이전 상태를 백업 이름으로 남기라고 요구한다
async function restore(target, source, label) {
  await waitIdle();
  try {
    await api(`/branches/${target}/restore`, { source_branch_id: source });
  } catch (e) {
    if (!String(e.message).includes('preserve_under_name')) throw e;
    const backup = `demo-seed-backup-${new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}`;
    console.log(`  이전 상태를 ${backup} 로 보존`);
    await api(`/branches/${target}/restore`, { source_branch_id: source, preserve_under_name: backup });
  }
  await waitIdle();
  console.log(`✔ ${label}`);
}

async function migrateDemo(statusOnly) {
  const q = new URLSearchParams({ branch_id: DEMO_BRANCH_ID, database_name: PGDATABASE, role_name: PGUSER, pooled: 'false' });
  const { uri } = await api(`/connection_uri?${q}`);
  const env = { ...process.env, DATABASE_URL_UNPOOLED: uri, DATABASE_URL: uri }; // 주소는 출력하지 않는다
  process.stdout.write(execFileSync('node', ['scripts/migrate.mjs', ...(statusOnly ? ['status'] : [])], { env, encoding: 'utf8' }));
}

if (process.argv[2] === 'status') {
  await migrateDemo(true);
} else {
  await restore(DEMO_BRANCH_ID, DEMO_SEED_BRANCH_ID, '1/4 demo ← demo-seed');
  await migrateDemo(false);
  console.log('✔ 2/4 demo 마이그레이션');
  await restore(DEMO_SEED_BRANCH_ID, DEMO_BRANCH_ID, '3/4 demo-seed ← demo');
  await restore(DEMO_BRANCH_ID, DEMO_SEED_BRANCH_ID, '4/4 demo ← demo-seed (브랜치 관계 복구)');
}
