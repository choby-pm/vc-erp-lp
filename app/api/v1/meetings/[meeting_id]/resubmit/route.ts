import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { getMeeting, submitVotes } from "@/lib/services/meetings";

// POST /api/v1/meetings/{meeting_id}/resubmit — 승인된 투표를 GP에 다시 보내기 (BR-SYNC-11). 승인된 찬반과 지금 찬반이 같을 때만
export const POST = withOrgUser<RouteContext<"/api/v1/meetings/[meeting_id]/resubmit">>(async (_request, ctx, user) => {
  const { meeting_id } = await ctx.params;
  const gp_sync = await submitVotes(user.org_id, meeting_id, { type: "user", user });
  return ok({ ...(await getMeeting(user.org_id, meeting_id)), gp_sync });
});
