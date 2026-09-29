import type { Role } from "./roles";

// 역할별 권한 (04 비즈니스 규칙 BR-AUTH-01·02, 🔗 GP D42와 같은 방식)
// · LP ERP 내부 API(/api/v1)의 모든 요청이 withOrgUser 에서 여기를 거친다. 규칙은 위에서부터 처음 맞는 것 하나를 쓴다
// · 조회(GET)는 기본적으로 모두 허용하고, 규칙에 read 를 적은 것만 막는다. 쓰기는 기본이 "출자 담당"
// · 관리자는 모든 작업을 할 수 있다 (결재 포함, L12)
// · 화면 버튼은 역할과 관계없이 보일 수 있지만, 서버가 막고 이유를 알려준다 (메뉴만 역할에 맞게 숨긴다)

type Rule = { pattern: RegExp; write?: Role[]; read?: Role[]; area: string };

const ID = "[^/]+";

// admin 은 항상 허용되므로 목록에 적지 않는다
const RULES: Rule[] = [
  // 계산만 하고 저장하지 않는 점검·미리보기 (조회와 같다)
  { pattern: /\/(preview|selection-check|formation-check|close-check)$/, write: ["officer", "approver", "viewer"], area: "미리보기" },
  // 관리자 전용
  { pattern: /^\/users(\/|$)/, write: [], read: [], area: "사용자 관리" },
  { pattern: /^\/org$/, write: [], area: "기관 정보" },
  { pattern: /^\/audit-logs(\/|$)/, write: [], read: [], area: "감사 로그" },
  { pattern: /^\/integration(\/|$)/, write: [], read: [], area: "GP 연동 관리" },
  { pattern: /^\/evaluation-criteria(\/|$)/, write: [], area: "평가 항목" },
  // 결재: 승인·반려는 결재권자 (기안자 본인 결재 금지는 서비스·DB가 막는다, BR-APR-05)
  { pattern: new RegExp(`^/approvals/${ID}/(approve|reject)$`), write: ["approver"], area: "결재 승인·반려" },
  // 기준 정보
  { pattern: /^\/gps(\/|$)/, write: ["officer"], area: "운용사 등록·수정" },
  { pattern: new RegExp(`^/funds(/${ID})?(/status)?$`), write: ["officer"], area: "조합 등록·수정" },
  // 출자 계획
  { pattern: /^\/budgets(\/|$)/, write: ["officer"], area: "출자 예산" },
  { pattern: /^\/programs(\/|$)/, write: ["officer"], area: "출자사업" },
  // 심사 평가는 출자 담당·결재권자 모두 심사위원이 될 수 있다
  { pattern: new RegExp(`^/proposals/${ID}/evaluations/${ID}$`), write: ["officer", "approver"], area: "심사 평가" },
  { pattern: /^\/proposals(\/|$)/, write: ["officer"], area: "출자 제안" },
];
const DEFAULT_WRITE: Role[] = ["officer"];

export type Decision = { allowed: true } | { allowed: false; area: string; roles: Role[] };

// path 는 /api/v1 을 뺀 주소 (예: /users/…/role)
export function authorize(role: Role, method: string, path: string): Decision {
  if (role === "admin") return { allowed: true };
  const reading = method === "GET" || method === "HEAD";
  const rule = RULES.find((r) => r.pattern.test(path));
  const roles = reading ? rule?.read : (rule?.write ?? DEFAULT_WRITE);
  if (!roles || roles.includes(role)) return { allowed: true };
  return { allowed: false, area: rule?.area ?? "업무 기록", roles: ["admin", ...roles] };
}

export const isAdmin = (role: Role) => role === "admin";
