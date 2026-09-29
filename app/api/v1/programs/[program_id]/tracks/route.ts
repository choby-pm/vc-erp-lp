import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { trackSchema } from "@/lib/schemas/programs";
import { addTrack } from "@/lib/services/programs";

// POST /api/v1/programs/{program_id}/tracks — 모집 부문 추가 (작성 중에만, BR-PRG-02)
export const POST = withOrgUser<RouteContext<"/api/v1/programs/[program_id]/tracks">>(async (request, ctx, user) => {
  const input = await parseBody(request, trackSchema);
  return ok(await addTrack(user.org_id, (await ctx.params).program_id, input), 201);
});
