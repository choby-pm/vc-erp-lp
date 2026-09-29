import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { retireCriterion, weightSum } from "@/lib/services/evaluations";

// POST /api/v1/evaluation-criteria/{criterion_id}/retire — 항목 은퇴 (관리자). 과거 평가표의 점수는 남는다 (BR-EVAL-01)
export const POST = withOrgUser<RouteContext<"/api/v1/evaluation-criteria/[criterion_id]/retire">>(async (_request, ctx, user) => {
  const criteria = await retireCriterion(user.org_id, (await ctx.params).criterion_id);
  return ok({ criteria, weight_sum: weightSum(criteria) });
});
