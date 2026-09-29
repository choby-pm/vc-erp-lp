import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { closeProgram } from "@/lib/services/programs";

// POST /api/v1/programs/{program_id}/close — 선정 완료. 결정하지 않은 제안·결재 대기가 없어야 한다 (BR-PRG-01)
export const POST = withOrgUser<RouteContext<"/api/v1/programs/[program_id]/close">>(async (_request, ctx, user) =>
  ok(await closeProgram(user.org_id, (await ctx.params).program_id)),
);
