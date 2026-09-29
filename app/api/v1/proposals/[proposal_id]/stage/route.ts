import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { stageMoveSchema } from "@/lib/schemas/proposals";
import { moveStage } from "@/lib/services/proposals";

// POST /api/v1/proposals/{proposal_id}/stage — 심사 단계 이동 { to_status, note } (앞으로만, 건너뛰기 가능, BR-PROP-04)
export const POST = withOrgUser<RouteContext<"/api/v1/proposals/[proposal_id]/stage">>(async (request, ctx, user) => {
  const { to_status, note } = await parseBody(request, stageMoveSchema);
  return ok(await moveStage(user.org_id, user.id, (await ctx.params).proposal_id, to_status, note));
});
