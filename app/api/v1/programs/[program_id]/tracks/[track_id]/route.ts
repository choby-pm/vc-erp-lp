import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { trackSchema } from "@/lib/schemas/programs";
import { deleteTrack, updateTrack } from "@/lib/services/programs";

type Ctx = RouteContext<"/api/v1/programs/[program_id]/tracks/[track_id]">;

// PATCH /api/v1/programs/{program_id}/tracks/{track_id} — 모집 부문 수정 (작성 중에만)
export const PATCH = withOrgUser<Ctx>(async (request, ctx, user) => {
  const { program_id, track_id } = await ctx.params;
  const input = await parseBody(request, trackSchema);
  return ok(await updateTrack(user.org_id, program_id, track_id, input));
});

// DELETE /api/v1/programs/{program_id}/tracks/{track_id} — 모집 부문 삭제 (작성 중에만)
export const DELETE = withOrgUser<Ctx>(async (_request, ctx, user) => {
  const { program_id, track_id } = await ctx.params;
  return ok(await deleteTrack(user.org_id, program_id, track_id));
});
