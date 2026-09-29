import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { gpSchema } from "@/lib/schemas/gps";
import { createGp, listGps } from "@/lib/services/gps";

// GET /api/v1/gps?q= — 우리 기관 운용사 목록 (연동 여부·조합 수 포함)
export const GET = withOrgUser(async (request, _ctx, user) => {
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) || undefined;
  return ok(await listGps(user.org_id, q));
});

// POST /api/v1/gps — 운용사 등록 (출자 담당·관리자, BR-GP-01)
export const POST = withOrgUser(async (request, _ctx, user) => {
  const input = await parseBody(request, gpSchema);
  return ok(await createGp(user.org_id, user.id, input), 201);
});
