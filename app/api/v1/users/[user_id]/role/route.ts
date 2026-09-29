import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { userRoleSchema } from "@/lib/schemas/users";
import { setUserRole } from "@/lib/services/users";

// PUT /api/v1/users/{user_id}/role — 역할 변경 { role } (관리자, 자기 자신 불가, BR-AUTH-03)
export const PUT = withOrgUser<RouteContext<"/api/v1/users/[user_id]/role">>(async (request, ctx, user) => {
  const { user_id } = await ctx.params;
  const { role } = await parseBody(request, userRoleSchema);
  return ok(await setUserRole(user.org_id, user.id, user_id, role));
});
