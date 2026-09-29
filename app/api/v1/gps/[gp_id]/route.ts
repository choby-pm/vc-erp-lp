import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { gpSchema } from "@/lib/schemas/gps";
import { getGp, updateGp } from "@/lib/services/gps";

// GET /api/v1/gps/{gp_id} — 운용사 상세 + 조합 목록
export const GET = withOrgUser<RouteContext<"/api/v1/gps/[gp_id]">>(async (_request, ctx, user) => {
  const { gp_id } = await ctx.params;
  return ok(await getGp(user.org_id, gp_id));
});

// PATCH /api/v1/gps/{gp_id} — 운용사 정보 수정 (연동 설정은 바꿀 수 없다, BR-GP-02)
export const PATCH = withOrgUser<RouteContext<"/api/v1/gps/[gp_id]">>(async (request, ctx, user) => {
  const { gp_id } = await ctx.params;
  const input = await parseBody(request, gpSchema);
  return ok(await updateGp(user.org_id, gp_id, input));
});
