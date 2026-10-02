import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { stageMoveSchema } from "@/lib/schemas/proposals";
import { moveStage } from "@/lib/services/proposals";

// POST /api/v1/proposals/{proposal_id}/stage — 심사 단계 이동 { to_status, note } (앞으로만, 건너뛰기 가능, BR-PROP-04)
// 연동 제안이면 저장 뒤 GP에 응답을 보내고 결과를 gp_sync 에 담는다 (BR-PROP-06)
export const POST = withOrgUser<RouteContext<"/api/v1/proposals/[proposal_id]/stage">>(async (request, ctx, user) => {
  const { to_status, note } = await parseBody(request, stageMoveSchema);
  return ok(await moveStage(user.org_id, user.id, (await ctx.params).proposal_id, to_status, note, { type: "user", user }));
});
