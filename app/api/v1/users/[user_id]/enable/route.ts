import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { setUserDisabled } from "@/lib/services/users";

// POST /api/v1/users/{user_id}/enable — 중지한 계정 다시 사용 (관리자)
export const POST = withOrgUser<RouteContext<"/api/v1/users/[user_id]/enable">>(async (_request, ctx, user) => {
  const { user_id } = await ctx.params;
  return ok(await setUserDisabled(user.org_id, user.id, user_id, false));
});
