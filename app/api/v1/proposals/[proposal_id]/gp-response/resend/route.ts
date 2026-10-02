import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { resendGpResponse } from "@/lib/gp/responses";

// POST /api/v1/proposals/{proposal_id}/gp-response/resend — GP에 응답 다시 보내기 (출자 담당·관리자, BR-SYNC-11)
// 지금 LP 상태에 맞는 응답(검토 중·확약·거절)을 보낸다. GP가 거부했던 것도 보낸다. 결과는 { status: sent | pending | rejected }
export const POST = withOrgUser<RouteContext<"/api/v1/proposals/[proposal_id]/gp-response/resend">>(async (_request, ctx, user) => {
  const { proposal_id } = await ctx.params;
  return ok(await resendGpResponse(user.org_id, proposal_id, { type: "user", user }));
});
