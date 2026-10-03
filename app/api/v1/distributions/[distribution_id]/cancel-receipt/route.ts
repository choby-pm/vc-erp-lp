import { ok } from "@/lib/api/response";
import { validateBody, withOrgUser } from "@/lib/api/handler";
import { idempotent } from "@/lib/api/idempotency";
import { distributionCorrectSchema } from "@/lib/schemas/distributions";
import { correctReceipt } from "@/lib/services/distributions";

// POST /api/v1/distributions/{distribution_id}/cancel-receipt — 수령 기록 정정 { reason } 💰 (BR-DIST-05)
// 원래 날짜로 취소 행, 수령 대기로 되돌림. 가져온 수령은 GP_MANAGED_FIELD
export const POST = withOrgUser<RouteContext<"/api/v1/distributions/[distribution_id]/cancel-receipt">>(async (request, ctx, user) => {
  const { distribution_id } = await ctx.params;
  return idempotent(request, user, async (body) => ok(await correctReceipt(user.org_id, user.id, distribution_id, validateBody(body, distributionCorrectSchema).reason)));
});
