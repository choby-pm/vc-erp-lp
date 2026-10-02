import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { decideSchema } from "@/lib/schemas/proposals";
import { rejectProposal } from "@/lib/services/proposals";

// POST /api/v1/proposals/{proposal_id}/reject — 탈락 { decided_date?, note } (BR-PROP-04)
// 연동 제안이면 저장 뒤 GP에 거절을 보내고 결과를 gp_sync 에 담는다 (BR-PROP-06)
export const POST = withOrgUser<RouteContext<"/api/v1/proposals/[proposal_id]/reject">>(async (request, ctx, user) => {
  const input = await parseBody(request, decideSchema);
  return ok(await rejectProposal(user.org_id, user.id, (await ctx.params).proposal_id, input, { type: "user", user }));
});
