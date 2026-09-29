import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { budgetUpdateSchema } from "@/lib/schemas/budgets";
import { getBudget, updateBudget } from "@/lib/services/budgets";

// GET /api/v1/budgets/{budget_id} — 예산 상세 + 분야별 배분·사용
export const GET = withOrgUser<RouteContext<"/api/v1/budgets/[budget_id]">>(async (_request, ctx, user) => {
  const { budget_id } = await ctx.params;
  return ok(await getBudget(user.org_id, budget_id));
});

// PATCH /api/v1/budgets/{budget_id} — 총액·메모 수정 (사용액·배분 합계보다 작게 못 줄임, BR-BUD-02·06)
export const PATCH = withOrgUser<RouteContext<"/api/v1/budgets/[budget_id]">>(async (request, ctx, user) => {
  const { budget_id } = await ctx.params;
  const input = await parseBody(request, budgetUpdateSchema);
  return ok(await updateBudget(user.org_id, budget_id, input));
});
