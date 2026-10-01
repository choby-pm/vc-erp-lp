import { assertUuid } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { processExclusive, retryInboundEvent } from "@/lib/gp/sync";

// POST /api/v1/integration/events/{event_id}/retry — 실패 이벤트 다시 처리 (관리자, BR-SYNC-07)
// 시도 횟수를 0으로 돌리고 바로 처리한다
export const POST = withOrgUser<RouteContext<"/api/v1/integration/events/[event_id]/retry">>(async (_request, ctx, user) => {
  const { event_id } = await ctx.params;
  assertUuid(event_id, "이벤트를");
  await retryInboundEvent(user.org_id, event_id);
  return ok(await processExclusive("manual"));
});
