import { ok } from "@/lib/api/response";
import { validateBody, withOrgUser } from "@/lib/api/handler";
import { idempotent } from "@/lib/api/idempotency";
import { approvalDecisionSchema } from "@/lib/schemas/approvals";
import { approve } from "@/lib/services/approvals";

// POST /api/v1/approvals/{approval_id}/approve — 승인 { decision_comment } 💰 Idempotency-Key 필수
// 결재권자·관리자, 본인 결재 불가. 선정이면 예산·부문 한도를 다시 검사하고 제안 선정 + 출자 건 생성 (BR-SEL-03, 05 4-1)
export const POST = withOrgUser<RouteContext<"/api/v1/approvals/[approval_id]/approve">>(async (request, ctx, user) => {
  const { approval_id } = await ctx.params;
  return idempotent(request, user, async (body) => {
    const { decision_comment } = validateBody(body, approvalDecisionSchema);
    return ok(await approve(user.org_id, user.id, approval_id, decision_comment));
  });
});
