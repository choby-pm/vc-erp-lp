import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { markVotesSubmitted } from "@/lib/services/meetings";

// POST /api/v1/meetings/{meeting_id}/mark-submitted — 수기 총회: 승인된 투표를 서면으로 냈다고 기록 (BR-VOTE-04)
export const POST = withOrgUser<RouteContext<"/api/v1/meetings/[meeting_id]/mark-submitted">>(async (_request, ctx, user) =>
  ok(await markVotesSubmitted(user.org_id, (await ctx.params).meeting_id)),
);
