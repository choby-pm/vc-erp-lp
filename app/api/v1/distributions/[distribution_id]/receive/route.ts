import { ok } from "@/lib/api/response";
import { validateBody, withOrgUser } from "@/lib/api/handler";
import { idempotent } from "@/lib/api/idempotency";
import { distributionReceiveSchema } from "@/lib/schemas/distributions";
import { receiveDistribution } from "@/lib/services/distributions";

// POST /api/v1/distributions/{distribution_id}/receive — 수령 기록 { received_date } 💰 Idempotency-Key 필수 (BR-DIST-03, L39)
// 한 트랜잭션: 수령 + 우리 장부 '분배' 행 + (연동) 분배 대사. 결재 없음
export const POST = withOrgUser<RouteContext<"/api/v1/distributions/[distribution_id]/receive">>(async (request, ctx, user) => {
  const { distribution_id } = await ctx.params;
  return idempotent(request, user, async (body) => ok(await receiveDistribution(user.org_id, user.id, distribution_id, validateBody(body, distributionReceiveSchema))));
});
