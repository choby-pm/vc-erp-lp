import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { userUpdateSchema } from "@/lib/schemas/users";
import { updateUser } from "@/lib/services/users";

// PATCH /api/v1/users/{user_id} — 이름 수정 (관리자)
export const PATCH = withOrgUser<RouteContext<"/api/v1/users/[user_id]">>(async (request, ctx, user) => {
  const { user_id } = await ctx.params;
  const input = await parseBody(request, userUpdateSchema);
  return ok(await updateUser(user.org_id, user_id, input));
});
