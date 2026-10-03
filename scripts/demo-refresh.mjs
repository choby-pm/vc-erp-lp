// 데모 DB 새로 고침 (L23, 🔗 GP scripts/demo-refresh.mjs 와 같은 방식)
//
// 배포 사이트가 쓰는 데모 DB(Neon demo 브랜치)는 매일 demo-seed 브랜치로 초기화된다.
// 마이그레이션을 추가했거나 데모 데이터를 바꿨으면, main(개발 DB) → demo-seed → demo 순서로 복사해 반영한다.
//
// 사용법
//   npm run db:migrate          먼저 main 에 마이그레이션
//   npm run db:demo-refresh     main 의 지금 상태를 데모 원본으로 삼고 데모 DB를 바로 초기화
//   npm run db:demo-refresh -- --prune-backups   갱신 뒤 자식이 없는 옛 백업 브랜치를 지운다
//
// ⚠️ main 에 테스트로 넣은 데이터도 그대로 데모에 들어간다. 데모에 보일 상태인지 확인하고 실행한다
// ⚠️ GP와 짝을 맞춘다 (L23): GP 에서 먼저 npm run db:demo-refresh → 바로 이어서 LP 에서 실행.
//    두 로컬 main 이 서로 맞는 상태(연결·첫 맞추기 완료, 제안 상태 같음)일 때만 한다. 하나만 갱신하면 배포 GP·LP가 어긋난다

const { NEON_API_KEY, NEON_PROJECT_ID, DEMO_BRANCH_ID, DEMO_SEED_BRANCH_ID } = process.env;
if (!NEON_API_KEY || !NEON_PROJECT_ID || !DEMO_BRANCH_ID || !DEMO_SEED_BRANCH_ID) {
  console.error("NEON_API_KEY, NEON_PROJECT_ID, DEMO_BRANCH_ID, DEMO_SEED_BRANCH_ID 가 .env.local 에 필요합니다.");
  process.exit(1);
}

const api = (path, body) =>
  fetch(`https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${NEON_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${path} 실패 (HTTP ${res.status}): ${json.message ?? ""}`);
    return json;
  });

// 앞 작업(브랜치 복원)이 끝나야 다음 복원을 할 수 있다
async function waitIdle() {
  for (let i = 0; i < 60; i++) {
    const { operations } = await api(`/operations?limit=10`);
    if (!operations.some((o) => ["scheduling", "running"].includes(o.status))) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Neon 작업이 끝나지 않았습니다");
}

const { branches } = await api("/branches");
const main = branches.find((b) => b.default);
console.log(`1/2 demo-seed ← ${main.name} (지금 상태 복사)`);
// demo-seed 에 자식 브랜치가 있으면 Neon은 기존 상태를 백업 브랜치로 남기라고 요구한다 (preserve_under_name).
// 그때만 날짜를 붙인 백업을 남긴다. 백업이 쌓이면 Neon 콘솔에서 지운다 (무료 요금제 브랜치 개수 제한)
try {
  await api(`/branches/${DEMO_SEED_BRANCH_ID}/restore`, { source_branch_id: main.id });
} catch (err) {
  if (!String(err.message).includes("preserve_under_name")) throw err;
  // 하루에 여러 번 갱신해도 이름이 겹치지 않게 시각까지 붙인다
  const backup = `demo-seed-backup-${new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}`;
  console.log(`  demo-seed 에 자식 브랜치가 있어 이전 상태를 ${backup} 로 남깁니다`);
  await api(`/branches/${DEMO_SEED_BRANCH_ID}/restore`, { source_branch_id: main.id, preserve_under_name: backup });
}
await waitIdle();
console.log("2/2 demo ← demo-seed (데모 DB 초기화)");
await api(`/branches/${DEMO_BRANCH_ID}/restore`, { source_branch_id: DEMO_SEED_BRANCH_ID });
await waitIdle();

// --prune-backups: 자식 브랜치가 없는 옛 백업(demo-seed-backup-*)을 지운다 (무료 요금제 브랜치 개수 제한).
// demo 를 demo-seed 로 되돌리면 demo 의 부모가 새 demo-seed 로 바뀌어 옛 백업은 자식이 없어진다. 되돌릴 수 없으므로 붙였을 때만
if (process.argv.includes('--prune-backups')) {
  const { branches: all } = await api('/branches');
  const parents = new Set(all.map((b) => b.parent_id).filter(Boolean));
  for (const b of all.filter((x) => x.name.startsWith('demo-seed-backup-') && !parents.has(x.id))) {
    await fetch(`https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/branches/${b.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${NEON_API_KEY}` } });
    console.log(`  옛 백업 ${b.name} 삭제`);
  }
}
console.log("✔ 데모 DB를 새로 고쳤습니다");
