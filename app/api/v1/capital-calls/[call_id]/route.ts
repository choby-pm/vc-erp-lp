import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { getCapitalCall } from "@/lib/services/capital-calls";

// GET /api/v1/capital-calls/{call_id} — 캐피탈콜 상세 (우리 납입 합계·상태, GP가 본 납입 상태). 납입 목록은 R4-2
export const GET = withOrgUser<RouteContext<"/api/v1/capital-calls/[call_id]">>(async (_request, ctx, user) =>
  ok(await getCapitalCall(user.org_id, (await ctx.params).call_id)),
);
