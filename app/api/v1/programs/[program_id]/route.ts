import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { programSchema } from "@/lib/schemas/programs";
import { deleteProgram, getProgram, updateProgram } from "@/lib/services/programs";

type Ctx = RouteContext<"/api/v1/programs/[program_id]">;

// GET /api/v1/programs/{program_id} — 상세 (부문별 접수·선정 현황, 예산 잔액)
export const GET = withOrgUser<Ctx>(async (_request, ctx, user) => ok(await getProgram(user.org_id, (await ctx.params).program_id)));

// PATCH /api/v1/programs/{program_id} — 사업 정보 수정 (작성 중에만, BR-PRG-02)
export const PATCH = withOrgUser<Ctx>(async (request, ctx, user) => {
  const input = await parseBody(request, programSchema);
  return ok(await updateProgram(user.org_id, (await ctx.params).program_id, input));
});

// DELETE /api/v1/programs/{program_id} — 작성 중인 사업 삭제
export const DELETE = withOrgUser<Ctx>(async (_request, ctx, user) => ok(await deleteProgram(user.org_id, (await ctx.params).program_id)));
