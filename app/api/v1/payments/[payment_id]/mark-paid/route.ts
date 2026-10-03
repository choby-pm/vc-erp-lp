import { ok } from "@/lib/api/response";
import { validateBody, withOrgUser } from "@/lib/api/handler";
import { idempotent } from "@/lib/api/idempotency";
import { paymentMarkPaidSchema } from "@/lib/schemas/payments";
import { markPaid } from "@/lib/services/payments";

// POST /api/v1/payments/{payment_id}/mark-paid — 송금 완료 기록 💰 Idempotency-Key 필수 { paid_date, bank_reference? }
// 승인된 납입만 (BR-PAY-03). 한 트랜잭션: 송금 완료 + 우리 장부 '납입' 행 + (연동) 납입 대사 (BR-PAY-04)
// 응답의 reconciliation: GP 입금 확인 전이라 불일치면 waiting_until 까지 "확인 대기" (L10)
export const POST = withOrgUser<RouteContext<"/api/v1/payments/[payment_id]/mark-paid">>(async (request, ctx, user) => {
  const { payment_id } = await ctx.params;
  return idempotent(request, user, async (body) => ok(await markPaid(user.org_id, user.id, payment_id, validateBody(body, paymentMarkPaidSchema))));
});
