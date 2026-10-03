import { z } from "zod";
import { ok } from "@/lib/api/response";
import { validateBody, withOrgUser } from "@/lib/api/handler";
import { idempotent } from "@/lib/api/idempotency";
import { closeCommitment } from "@/lib/services/closing";

const schema = z.object({ closed_date: z.iso.date("청산일 형식이 올바르지 않습니다").nullish().transform((v) => v ?? null) });

// POST /api/v1/commitments/{commitment_id}/close — 청산 확인 { closed_date? } 💰 Idempotency-Key 필수 (BR-CLOSE-01·02)
// 조건을 모두 채워야 한다 (CLOSE_CHECK_FAILED + details.checks). 청산일 기준 최종 성과를 final_metrics 에 고정하고 잠근다
export const POST = withOrgUser<RouteContext<"/api/v1/commitments/[commitment_id]/close">>(async (request, ctx, user) => {
  const { commitment_id } = await ctx.params;
  return idempotent(request, user, async (body) => ok(await closeCommitment(user.org_id, commitment_id, validateBody(body, schema).closed_date)));
});
