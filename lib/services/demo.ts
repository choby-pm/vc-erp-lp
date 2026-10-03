// 데모 DB 매일 초기화 (L23, 🔗 GP D44 · lib/services/demo.ts 와 같은 방식)
// · 배포 사이트는 Neon 의 demo 브랜치를 쓴다 (APP_DATABASE_URL). 로컬 개발은 main 브랜치
// · demo-seed 브랜치(고정 스냅샷)로 demo 를 되돌린다 → 면접관이 마음껏 써 봐도 다음 날 원래 데모 데이터
// · GP도 같은 시각(03:00 KST)에 되돌린다. 두 demo-seed 는 연결·첫 맞추기가 끝난 로컬 DB를 함께 복사해 만든 짝이라
//   되돌린 뒤에도 GP 이벤트 위치·제안 상태가 서로 맞는다 (L23)
// · LP는 첨부 파일 저장소를 아직 쓰지 않아 지울 파일이 없다

const NEON_API = "https://console.neon.tech/api/v2";

export function demoResetConfig() {
  const { NEON_API_KEY, NEON_PROJECT_ID, DEMO_BRANCH_ID, DEMO_SEED_BRANCH_ID } = process.env;
  if (!NEON_API_KEY || !NEON_PROJECT_ID || !DEMO_BRANCH_ID || !DEMO_SEED_BRANCH_ID) return null;
  return { apiKey: NEON_API_KEY, projectId: NEON_PROJECT_ID, demoBranchId: DEMO_BRANCH_ID, seedBranchId: DEMO_SEED_BRANCH_ID };
}

// Neon 브랜치 복원: target 을 source 의 최신 상태로 되돌린다
async function restoreBranch(apiKey: string, projectId: string, targetBranchId: string, sourceBranchId: string) {
  const res = await fetch(`${NEON_API}/projects/${projectId}/branches/${targetBranchId}/restore`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ source_branch_id: sourceBranchId }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(`Neon 브랜치 복원 실패 (HTTP ${res.status}): ${json.message ?? ""}`.trim());
}

export async function resetDemo() {
  const config = demoResetConfig();
  if (!config) return { configured: false as const };
  await restoreBranch(config.apiKey, config.projectId, config.demoBranchId, config.seedBranchId);
  return { configured: true as const, restored_from: "demo-seed" };
}
