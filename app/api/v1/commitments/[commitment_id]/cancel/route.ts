import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { commitmentCancelSchema } from "@/lib/schemas/commitments";
import { cancelCommitment } from "@/lib/services/commitments";
import { sendGpResponse } from "@/lib/gp/responses";

// POST /api/v1/commitments/{commitment_id}/cancel — 선정 취소 { reason } (결성 대기에서만, BR-CMT-05)
// 출자 예정액은 예산 사용액에서 빠진다 (v_budget_usage). 연동 제안이면 저장 뒤 GP에 확약 철회 통보 (L63, 실패하면 주기 작업이 다시 보낸다)
export const POST = withOrgUser<RouteContext<"/api/v1/commitments/[commitment_id]/cancel">>(async (request, ctx, user) => {
  const input = await parseBody(request, commitmentCancelSchema);
  const commitment = await cancelCommitment(user.org_id, (await ctx.params).commitment_id, input);
  const gp_sync = commitment.proposal_id ? await sendGpResponse(user.org_id, commitment.proposal_id, { type: "user", user }) : { status: "not_needed" as const };
  return ok({ ...commitment, gp_sync });
});
