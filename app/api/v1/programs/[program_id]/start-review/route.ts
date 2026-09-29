import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { startReview } from "@/lib/services/programs";

// POST /api/v1/programs/{program_id}/start-review — 접수 마감 → 심사 시작 (BR-PRG-01)
export const POST = withOrgUser<RouteContext<"/api/v1/programs/[program_id]/start-review">>(async (_request, ctx, user) =>
  ok(await startReview(user.org_id, (await ctx.params).program_id)),
);
