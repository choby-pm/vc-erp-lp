import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { fundSchema } from "@/lib/schemas/funds";
import { getFund, updateFund } from "@/lib/services/funds";

// GET /api/v1/funds/{fund_id} — 조합 상세
export const GET = withOrgUser<RouteContext<"/api/v1/funds/[fund_id]">>(async (_request, ctx, user) => {
  const { fund_id } = await ctx.params;
  return ok(await getFund(user.org_id, fund_id));
});

// PATCH /api/v1/funds/{fund_id} — 수기 조합 기본 정보 수정 (연동 조합은 GP_MANAGED_FIELD, BR-COM-05)
export const PATCH = withOrgUser<RouteContext<"/api/v1/funds/[fund_id]">>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  const input = await parseBody(request, fundSchema);
  return ok(await updateFund(user.org_id, fund_id, input));
});
