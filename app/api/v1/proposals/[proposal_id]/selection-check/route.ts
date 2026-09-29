import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { selectionCheck } from "@/lib/services/selection";

// GET /api/v1/proposals/{proposal_id}/selection-check — 선정 결재를 올릴 수 있는지 점검 (저장하지 않음, 05 4-1)
export const GET = withOrgUser<RouteContext<"/api/v1/proposals/[proposal_id]/selection-check">>(async (_request, ctx, user) =>
  ok(await selectionCheck(user.org_id, (await ctx.params).proposal_id)),
);
