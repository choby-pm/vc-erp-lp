import { ok } from "@/lib/api/response";
import { validateBody, withOrgUser } from "@/lib/api/handler";
import { idempotent } from "@/lib/api/idempotency";
import { paymentCreateSchema } from "@/lib/schemas/payments";
import { getCapitalCall } from "@/lib/services/capital-calls";
import { listPayments, requestPayment } from "@/lib/services/payments";

type Ctx = RouteContext<"/api/v1/capital-calls/[call_id]/payments">;

// GET /api/v1/capital-calls/{call_id}/payments — 이 캐피탈콜의 납입 (분할 납입 포함, L9)
export const GET = withOrgUser<Ctx>(async (_request, ctx, user) => {
  const { call_id } = await ctx.params;
  await getCapitalCall(user.org_id, call_id); // 다른 기관이면 404
  return ok(await listPayments(user.org_id, call_id));
});

// POST /api/v1/capital-calls/{call_id}/payments — 납입 기안 💰 Idempotency-Key 필수 { amount, planned_date?, request_comment? }
// 납입 + 결재(대기)를 한 트랜잭션으로. 송금 완료 + 결재 대기 + 송금 대기 + 이번 ≤ 요청액 (BR-PAY-02, BR-APR-01·04)
export const POST = withOrgUser<Ctx>(async (request, ctx, user) => {
  const { call_id } = await ctx.params;
  return idempotent(request, user, async (body) => ok(await requestPayment(user.org_id, user.id, call_id, validateBody(body, paymentCreateSchema)), 201));
});
