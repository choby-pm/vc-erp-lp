import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { fundStatusSchema } from "@/lib/schemas/funds";
import { changeFundStatus } from "@/lib/services/funds";

// POST /api/v1/funds/{fund_id}/status — 수기 조합 상태 변경 { status, formation_date?, fund_size_amount? } (BR-FUND-02)
export const POST = withOrgUser<RouteContext<"/api/v1/funds/[fund_id]/status">>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  const input = await parseBody(request, fundStatusSchema);
  return ok(await changeFundStatus(user.org_id, fund_id, input));
});
