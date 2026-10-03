import { ok } from "@/lib/api/response";
import { validateBody, withOrgUser } from "@/lib/api/handler";
import { idempotent } from "@/lib/api/idempotency";
import { commitmentAdjustSchema } from "@/lib/schemas/commitments";
import { adjustCommitment } from "@/lib/services/commitment-ledger";

// POST /api/v1/commitments/{commitment_id}/commitment-adjustments — 약정 변경 💰 Idempotency-Key 필수 (BR-CMT-06)
// { new_amount, entry_date, memo }. 활성 출자 건만. 지금 약정 행들을 취소 행으로 지우고 새 금액 한 행 → (연동) 약정 대사
export const POST = withOrgUser<RouteContext<"/api/v1/commitments/[commitment_id]/commitment-adjustments">>(async (request, ctx, user) => {
  const { commitment_id } = await ctx.params;
  return idempotent(request, user, async (body) => {
    const input = validateBody(body, commitmentAdjustSchema);
    return ok(await adjustCommitment(user.org_id, user.id, commitment_id, input), 201);
  });
});
