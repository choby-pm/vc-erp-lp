import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { reviewKeyPersonChange } from "@/lib/services/funds";

// POST /api/v1/funds/{fund_id}/key-person-review — 핵심 운용 인력 변경 확인 (출자 담당·관리자, L37). 주의 목록에서 빠진다
export const POST = withOrgUser<RouteContext<"/api/v1/funds/[fund_id]/key-person-review">>(async (_request, ctx, user) =>
  ok(await reviewKeyPersonChange(user.org_id, user.id, (await ctx.params).fund_id)),
);
