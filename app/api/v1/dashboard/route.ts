import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { getDashboard } from "@/lib/services/dashboard";

// GET /api/v1/dashboard — 올해 예산 사용 · 포트폴리오 합계 · 자금 계획 · 30일 일정 · 주의 목록 (R5-4, R7-1, 04 14장)
// 저장하지 않고 매번 계산. 숫자는 예산 · 성과 · 자금 계획 화면과 같은 함수로 계산한다
export const GET = withOrgUser(async (_request, _ctx, user) => ok(await getDashboard(user.org_id, user)));
