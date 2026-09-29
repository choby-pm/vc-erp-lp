import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { criterionSchema } from "@/lib/schemas/proposals";
import { createCriterion, listCriteria, weightSum } from "@/lib/services/evaluations";

// GET /api/v1/evaluation-criteria?include_retired=true — 평가 항목 + 사용 중 가중치 합계 (모두 조회)
export const GET = withOrgUser(async (request, _ctx, user) => {
  const criteria = await listCriteria(user.org_id, new URL(request.url).searchParams.get("include_retired") === "true");
  return ok({ criteria, weight_sum: weightSum(criteria) });
});

// POST /api/v1/evaluation-criteria — 평가 항목 추가 (관리자, BR-EVAL-01)
export const POST = withOrgUser(async (request, _ctx, user) => {
  const input = await parseBody(request, criterionSchema);
  const criteria = await createCriterion(user.org_id, input);
  return ok({ criteria, weight_sum: weightSum(criteria) }, 201);
});
