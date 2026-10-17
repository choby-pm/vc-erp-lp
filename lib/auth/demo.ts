import type { Role } from "./roles";

// 데모 로그인: 기관 2곳 × 역할 3개 중 골라서 들어간다 (L17 함께 확정).
// 결재를 시연하려면 "출자 담당으로 기안 → 결재권자로 승인"처럼 역할을 바꿔 가며 들어가야 하기 때문이다.
// 계정은 scripts/seed-demo.mjs 가 만든다 (같은 기관 ID·이메일을 쓴다)

export const DEMO_ORGS = {
  a: { id: "0a000000-0000-4000-8000-00000000000a", name: "하늘연금 (데모)", org_type: "pension" },
  b: { id: "0b000000-0000-4000-8000-00000000000b", name: "바다성장출자 (데모)", org_type: "policy" },
  start: { id: "c1000000-0000-4000-8000-000000000001", name: "처음부터 체험 출자기관", org_type: "pension" },
  complete: { id: "c2000000-0000-4000-8000-000000000002", name: "완료 결과 확인 출자기관", org_type: "pension" },
  continue: { id: "c3000000-0000-4000-8000-000000000003", name: "이어서 체험 출자기관", org_type: "pension" },
} as const;
export type DemoOrgKey = keyof typeof DEMO_ORGS;

export const DEMO_CASES = [
  { key: "start", label: "처음부터 체험", hint: "연결만 준비된 상태에서 전체 흐름을 시작합니다." },
  { key: "complete", label: "완료 결과 확인", hint: "선정부터 청산까지 처리된 기록을 확인합니다." },
  { key: "continue", label: "이어서 체험", hint: "결성 이후 남은 업무를 직접 진행합니다." },
] as const;

export const DEMO_ROLES = ["officer", "approver", "admin"] as const satisfies readonly Role[];
export type DemoRole = (typeof DEMO_ROLES)[number];

export const demoEmail = (org: DemoOrgKey, role: DemoRole) => `${role}@${org}.demo.lp-erp.dev`;
