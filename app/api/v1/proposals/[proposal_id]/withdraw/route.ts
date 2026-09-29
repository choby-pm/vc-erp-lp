import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { decideSchema } from "@/lib/schemas/proposals";
import { withdrawProposal } from "@/lib/services/proposals";

// POST /api/v1/proposals/{proposal_id}/withdraw — GP 철회 { decided_date?, note } (수기 제안만, BR-PROP-05)
export const POST = withOrgUser<RouteContext<"/api/v1/proposals/[proposal_id]/withdraw">>(async (request, ctx, user) => {
  const input = await parseBody(request, decideSchema);
  return ok(await withdrawProposal(user.org_id, user.id, (await ctx.params).proposal_id, input));
});
