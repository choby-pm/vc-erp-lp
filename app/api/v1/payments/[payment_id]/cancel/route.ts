import { ok } from "@/lib/api/response";
import { validateBody, withOrgUser } from "@/lib/api/handler";
import { idempotent } from "@/lib/api/idempotency";
import { paymentCancelSchema } from "@/lib/schemas/payments";
import { cancelPayment } from "@/lib/services/payments";

// POST /api/v1/payments/{payment_id}/cancel — 송금 전 취소 또는 송금 기록 정정 💰 Idempotency-Key 필수 { reason }
// · 송금 대기 → 취소
// · 송금 완료 → 정정: 장부에 원래 날짜로 취소 행 + (연동) 납입 대사 (BR-PAY-05)
// · 결재 대기는 취소하지 않는다 — 결재권자가 반려 (APPROVAL_PENDING, L31)
export const POST = withOrgUser<RouteContext<"/api/v1/payments/[payment_id]/cancel">>(async (request, ctx, user) => {
  const { payment_id } = await ctx.params;
  return idempotent(request, user, async (body) => ok(await cancelPayment(user.org_id, user.id, payment_id, validateBody(body, paymentCancelSchema))));
});
