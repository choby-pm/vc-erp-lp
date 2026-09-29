import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { userCreateSchema } from "@/lib/schemas/users";
import { createUser, listUsers } from "@/lib/services/users";

// GET /api/v1/users — 우리 기관 사용자 목록 (관리자)
export const GET = withOrgUser(async (_request, _ctx, user) => ok(await listUsers(user.org_id)));

// POST /api/v1/users — 사용자 추가. 임시 비밀번호는 이 응답에서만 돌려준다 (관리자)
export const POST = withOrgUser(async (request, _ctx, user) => {
  const input = await parseBody(request, userCreateSchema);
  return ok(await createUser(user.org_id, input), 201);
});
