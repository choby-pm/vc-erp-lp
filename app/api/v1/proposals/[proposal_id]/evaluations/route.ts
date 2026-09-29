import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { listEvaluations } from "@/lib/services/evaluations";

// GET /api/v1/proposals/{proposal_id}/evaluations — 평가표 전체 + 단계별·전체 평균 (BR-EVAL-05)
export const GET = withOrgUser<RouteContext<"/api/v1/proposals/[proposal_id]/evaluations">>(async (_request, ctx, user) =>
  ok(await listEvaluations(user.org_id, (await ctx.params).proposal_id)),
);
