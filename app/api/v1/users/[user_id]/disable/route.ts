import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { setUserDisabled } from "@/lib/services/users";

// POST /api/v1/users/{user_id}/disable — 계정 중지. 기존 로그인도 바로 끊긴다 (관리자, 자기 자신 불가, BR-AUTH-05)
export const POST = withOrgUser<RouteContext<"/api/v1/users/[user_id]/disable">>(async (_request, ctx, user) => {
  const { user_id } = await ctx.params;
  return ok(await setUserDisabled(user.org_id, user.id, user_id, true));
});
