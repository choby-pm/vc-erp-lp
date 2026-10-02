import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { fundSchema, linkedFundSchema } from "@/lib/schemas/funds";
import { getFund, updateFund, updateLinkedFund } from "@/lib/services/funds";

// GET /api/v1/funds/{fund_id} — 조합 상세
export const GET = withOrgUser<RouteContext<"/api/v1/funds/[fund_id]">>(async (_request, ctx, user) => {
  const { fund_id } = await ctx.params;
  return ok(await getFund(user.org_id, fund_id));
});

// PATCH /api/v1/funds/{fund_id} — 조합 수정
// · 수기 조합: 기본 정보 전체
// · 연동 조합: { strategy } 만. 나머지는 GP 값이라 동기화만 바꾼다 (BR-COM-05, R3-5)
export const PATCH = withOrgUser<RouteContext<"/api/v1/funds/[fund_id]">>(async (request, ctx, user) => {
  const { fund_id } = await ctx.params;
  const fund = await getFund(user.org_id, fund_id);
  if (fund.data_source === "gp_api") return ok(await updateLinkedFund(user.org_id, fund_id, await parseBody(request, linkedFundSchema)));
  return ok(await updateFund(user.org_id, fund_id, await parseBody(request, fundSchema)));
});
