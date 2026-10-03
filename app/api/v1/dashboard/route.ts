import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { getAlerts } from "@/lib/services/alerts";

// GET /api/v1/dashboard — 주의 목록 (R5-4, 04 14장). 저장하지 않고 매번 계산. 예산·포트폴리오 합계·30일 일정은 R7
export const GET = withOrgUser(async (_request, _ctx, user) => ok({ alerts: await getAlerts(user.org_id, user) }));
