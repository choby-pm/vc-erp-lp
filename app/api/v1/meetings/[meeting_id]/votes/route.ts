import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { votesSaveSchema } from "@/lib/schemas/meetings";
import { saveVotes } from "@/lib/services/meetings";

// PUT /api/v1/meetings/{meeting_id}/votes — 투표안 저장 { votes: [{ agenda_id, choice, review_opinion }] } (결재 전, BR-VOTE-01·03, BR-APR-03)
// 제출한 찬반을 바꾸면 제출 안 됨으로 돌아가고 새 결재가 필요하다 (BR-VOTE-05)
export const PUT = withOrgUser<RouteContext<"/api/v1/meetings/[meeting_id]/votes">>(async (request, ctx, user) =>
  ok(await saveVotes(user.org_id, user.id, (await ctx.params).meeting_id, await parseBody(request, votesSaveSchema))),
);
