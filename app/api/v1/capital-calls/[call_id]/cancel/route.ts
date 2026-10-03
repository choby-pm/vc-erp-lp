import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { cancelManualCall } from "@/lib/services/capital-calls";

// POST /api/v1/capital-calls/{call_id}/cancel — 수기 캐피탈콜 취소 (BR-CALL-04)
// 송금한 납입이 있으면 CALL_HAS_PAYMENTS. 결재 대기·송금 대기 납입은 함께 취소된다. 연동 캐피탈콜은 GP_MANAGED_FIELD
export const POST = withOrgUser<RouteContext<"/api/v1/capital-calls/[call_id]/cancel">>(async (_request, ctx, user) =>
  ok(await cancelManualCall(user.org_id, (await ctx.params).call_id)),
);
