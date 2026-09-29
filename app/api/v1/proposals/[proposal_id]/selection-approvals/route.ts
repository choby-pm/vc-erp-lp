import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { approvalRequestSchema } from "@/lib/schemas/approvals";
import { requestSelection } from "@/lib/services/selection";

// POST /api/v1/proposals/{proposal_id}/selection-approvals — 선정 결재 기안 { request_comment }
// 예산 행을 잠그고 점검한 뒤 결재를 만든다. 결재 내용은 스냅샷으로 남는다 (BR-SEL-02, BR-APR-01~04)
export const POST = withOrgUser<RouteContext<"/api/v1/proposals/[proposal_id]/selection-approvals">>(async (request, ctx, user) => {
  const { request_comment } = await parseBody(request, approvalRequestSchema);
  return ok(await requestSelection(user.org_id, user.id, (await ctx.params).proposal_id, request_comment), 201);
});
