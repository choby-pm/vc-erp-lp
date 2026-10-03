import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { voteApprovalSchema } from "@/lib/schemas/meetings";
import { requestVoteApproval } from "@/lib/services/meetings";

// POST /api/v1/meetings/{meeting_id}/vote-approvals — 투표 결재 기안 { request_comment } (BR-VOTE-02, BR-APR-01·04)
// 모든 안건에 찬반이 있어야 한다 (VOTE_INCOMPLETE). 승인되면 연동 총회는 GP에 바로 제출된다 (BR-VOTE-04)
export const POST = withOrgUser<RouteContext<"/api/v1/meetings/[meeting_id]/vote-approvals">>(async (request, ctx, user) => {
  const { request_comment } = await parseBody(request, voteApprovalSchema);
  return ok(await requestVoteApproval(user.org_id, user.id, (await ctx.params).meeting_id, request_comment), 201);
});
