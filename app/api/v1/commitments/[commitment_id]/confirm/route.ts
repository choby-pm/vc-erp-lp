import { ok } from "@/lib/api/response";
import { validateBody, withOrgUser } from "@/lib/api/handler";
import { idempotent } from "@/lib/api/idempotency";
import { commitmentConfirmSchema } from "@/lib/schemas/commitments";
import { confirmCommitment, getCommitment } from "@/lib/services/commitments";

// POST /api/v1/commitments/{commitment_id}/confirm — 결성 확인 💰 Idempotency-Key 필수 (BR-CMT-02~04)
// · 연동: 본문 없음. GP와 다시 맞춘 뒤 GP 약정·결성 정보로 확인
// · 수기: { commitment_amount, fund_size_amount, formation_date }. 조합이 결성 전이면 조합도 결성 완료로 (L25)
// 한 트랜잭션: 확인표 검사 → (수기) 조합 결성 → 우리 장부 약정 행 → 활성 → (연동) 약정 대사
export const POST = withOrgUser<RouteContext<"/api/v1/commitments/[commitment_id]/confirm">>(async (request, ctx, user) => {
  const { commitment_id } = await ctx.params;
  return idempotent(request, user, async (body) => {
    const c = await getCommitment(user.org_id, commitment_id);
    const input = c.data_source === "manual" ? validateBody(body, commitmentConfirmSchema) : null;
    return ok(await confirmCommitment(user.org_id, user.id, commitment_id, input));
  });
});
