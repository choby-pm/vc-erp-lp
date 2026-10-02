import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { commitmentCancelSchema } from "@/lib/schemas/commitments";
import { cancelCommitment } from "@/lib/services/commitments";

// POST /api/v1/commitments/{commitment_id}/cancel — 선정 취소 { reason } (결성 대기에서만, BR-CMT-05)
// 출자 예정액은 예산 사용액에서 빠진다 (v_budget_usage). GP에는 알리지 않는다
export const POST = withOrgUser<RouteContext<"/api/v1/commitments/[commitment_id]/cancel">>(async (request, ctx, user) => {
  const input = await parseBody(request, commitmentCancelSchema);
  return ok(await cancelCommitment(user.org_id, (await ctx.params).commitment_id, input));
});
