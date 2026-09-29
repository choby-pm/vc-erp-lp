import type { Role } from "./roles";

// 데모 로그인: 기관 2곳 × 역할 3개 중 골라서 들어간다 (L17 함께 확정).
// 결재를 시연하려면 "출자 담당으로 기안 → 결재권자로 승인"처럼 역할을 바꿔 가며 들어가야 하기 때문이다.
// 계정은 scripts/seed-demo.mjs 가 만든다 (같은 기관 ID·이메일을 쓴다)

export const DEMO_ORGS = {
  a: { id: "0a000000-0000-4000-8000-00000000000a", name: "하늘연금 (데모)", org_type: "pension" },
  b: { id: "0b000000-0000-4000-8000-00000000000b", name: "바다성장출자 (데모)", org_type: "policy" },
} as const;
export type DemoOrgKey = keyof typeof DEMO_ORGS;

export const DEMO_ROLES = ["officer", "approver", "admin"] as const satisfies readonly Role[];
export type DemoRole = (typeof DEMO_ROLES)[number];

export const demoEmail = (org: DemoOrgKey, role: DemoRole) => `${role}@${org}.demo.lp-erp.dev`;
