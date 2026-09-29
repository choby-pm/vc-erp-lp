import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { orgUpdateSchema } from "@/lib/schemas/users";
import { getOrg, updateOrg } from "@/lib/services/users";

// GET /api/v1/org — 우리 기관 정보 (모두)
export const GET = withOrgUser(async (_request, _ctx, user) => ok(await getOrg(user.org_id)));

// PATCH /api/v1/org — 기관명 수정 (관리자)
export const PATCH = withOrgUser(async (request, _ctx, user) => {
  const input = await parseBody(request, orgUpdateSchema);
  return ok(await updateOrg(user.org_id, input));
});
