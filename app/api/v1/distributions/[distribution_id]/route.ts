import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { getDistribution } from "@/lib/services/distributions";

// GET /api/v1/distributions/{distribution_id} — 분배 상세 (원금 반환·수익, GP 단계별 금액, GP가 본 상태)
export const GET = withOrgUser<RouteContext<"/api/v1/distributions/[distribution_id]">>(async (_request, ctx, user) =>
  ok(await getDistribution(user.org_id, (await ctx.params).distribution_id)),
);
