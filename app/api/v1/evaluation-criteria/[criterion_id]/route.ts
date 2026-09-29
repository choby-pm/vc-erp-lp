import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { criterionSchema } from "@/lib/schemas/proposals";
import { updateCriterion, weightSum } from "@/lib/services/evaluations";

// PATCH /api/v1/evaluation-criteria/{criterion_id} — 항목 수정 (관리자). 이미 쓴 평가표는 평가 당시 가중치를 유지한다
export const PATCH = withOrgUser<RouteContext<"/api/v1/evaluation-criteria/[criterion_id]">>(async (request, ctx, user) => {
  const input = await parseBody(request, criterionSchema);
  const criteria = await updateCriterion(user.org_id, (await ctx.params).criterion_id, input);
  return ok({ criteria, weight_sum: weightSum(criteria) });
});
