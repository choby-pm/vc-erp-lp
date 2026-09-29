// 사용자 역할 4개 (04 비즈니스 규칙 BR-AUTH-01)
export const ROLES = ["admin", "officer", "approver", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "관리자",
  officer: "출자 담당",
  approver: "결재권자",
  viewer: "조회",
};
