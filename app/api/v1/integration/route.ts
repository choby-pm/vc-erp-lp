import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { integrationOverview } from "@/lib/services/integration";

// GET /api/v1/integration — 우리 기관의 GP 연결, 받은 이벤트 현황, 마지막 동기화 (관리자, 05 API 설계 3-13)
export const GET = withOrgUser(async (_request, _ctx, user) => ok(await integrationOverview(user.org_id)));
