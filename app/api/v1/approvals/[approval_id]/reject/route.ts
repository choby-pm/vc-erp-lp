import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { approvalDecisionSchema } from "@/lib/schemas/approvals";
import { reject } from "@/lib/services/approvals";

// POST /api/v1/approvals/{approval_id}/reject — 반려 { decision_comment } (사유 필수, BR-APR-06). 대상은 그대로
export const POST = withOrgUser<RouteContext<"/api/v1/approvals/[approval_id]/reject">>(async (request, ctx, user) => {
  const { decision_comment } = await parseBody(request, approvalDecisionSchema);
  return ok(await reject(user.org_id, user.id, (await ctx.params).approval_id, decision_comment));
});
