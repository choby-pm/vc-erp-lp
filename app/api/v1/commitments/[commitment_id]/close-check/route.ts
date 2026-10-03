import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { closeCheck } from "@/lib/services/closing";

// GET /api/v1/commitments/{commitment_id}/close-check — 청산 확인 조건표 (BR-CLOSE-01). 저장하지 않는다
export const GET = withOrgUser<RouteContext<"/api/v1/commitments/[commitment_id]/close-check">>(async (_request, ctx, user) =>
  ok(await closeCheck(user.org_id, (await ctx.params).commitment_id)),
);
