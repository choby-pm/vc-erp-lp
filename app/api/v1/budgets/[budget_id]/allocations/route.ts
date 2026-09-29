import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { allocationsSchema } from "@/lib/schemas/budgets";
import { putAllocations } from "@/lib/services/budgets";

// PUT /api/v1/budgets/{budget_id}/allocations — 분야별 배분 통째로 저장 (합계 ≤ 총액, BR-BUD-02)
export const PUT = withOrgUser<RouteContext<"/api/v1/budgets/[budget_id]/allocations">>(async (request, ctx, user) => {
  const { budget_id } = await ctx.params;
  const input = await parseBody(request, allocationsSchema);
  return ok(await putAllocations(user.org_id, budget_id, input));
});
