import { assertUuid } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { resyncFund } from "@/lib/gp/sync";

// POST /api/v1/funds/{fund_id}/resync — GP와 다시 맞추기 (출자 담당·관리자, BR-SYNC-09)
// 그 조합의 GP API를 다시 읽어 조합 정보·원장 사본을 갱신한다. 같은 일을 여러 번 해도 결과가 같다
export const POST = withOrgUser<RouteContext<"/api/v1/funds/[fund_id]/resync">>(async (_request, ctx, user) => {
  const { fund_id } = await ctx.params;
  assertUuid(fund_id, "조합을");
  return ok(await resyncFund(user.org_id, fund_id, { type: "user", user }));
});
