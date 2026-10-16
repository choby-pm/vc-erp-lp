import { withOrgUser } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getInvestmentObligations } from "@/lib/services/obligations";
export const GET = withOrgUser<
  RouteContext<"/api/v1/commitments/[commitment_id]/obligations">
>(async (request, ctx, user) =>
  ok(
    await getInvestmentObligations(
      user.org_id,
      (await ctx.params).commitment_id,
      new URL(request.url).searchParams.get("as_of"),
    ),
  ),
);
