import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { openProgram } from "@/lib/services/programs";

// POST /api/v1/programs/{program_id}/open — 공고 (작성 중 → 접수 중). 부문 1개 이상, 예산 잔액 초과는 경고만 (BR-PRG-01·03)
export const POST = withOrgUser<RouteContext<"/api/v1/programs/[program_id]/open">>(async (_request, ctx, user) =>
  ok(await openProgram(user.org_id, (await ctx.params).program_id)),
);
