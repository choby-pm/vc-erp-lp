import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { budgetCreateSchema } from "@/lib/schemas/budgets";
import { createBudget, listBudgets } from "@/lib/services/budgets";

// GET /api/v1/budgets — 연도별 출자 예산 (사용 현황 포함, BR-BUD-03)
export const GET = withOrgUser(async (_request, _ctx, user) => ok(await listBudgets(user.org_id)));

// POST /api/v1/budgets — 예산 만들기 { budget_year, total_amount, memo } (한 해 한 예산, BR-BUD-01)
export const POST = withOrgUser(async (request, _ctx, user) => {
  const input = await parseBody(request, budgetCreateSchema);
  return ok(await createBudget(user.org_id, user.id, input), 201);
});
