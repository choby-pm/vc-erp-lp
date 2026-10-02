import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { withOrgUser } from "@/lib/api/handler";
import { formationCheckQuerySchema } from "@/lib/schemas/commitments";
import { formationCheck } from "@/lib/services/commitments";

// GET /api/v1/commitments/{commitment_id}/formation-check — 결성 확인표 (BR-CMT-02). 저장하지 않는다
// 연동: GP 값으로. 수기: ?commitment_amount=&fund_size_amount=&formation_date= 로 입력 중인 값을 미리 본다
export const GET = withOrgUser<RouteContext<"/api/v1/commitments/[commitment_id]/formation-check">>(async (request, ctx, user) => {
  const parsed = formationCheckQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "입력값을 확인하세요");
  return ok(await formationCheck(user.org_id, (await ctx.params).commitment_id, parsed.data));
});
