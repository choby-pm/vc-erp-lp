import { z } from "zod";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { withOrgUser } from "@/lib/api/handler";
import { getCashPlan, thisMonth } from "@/lib/services/cash-plan";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "from 은 YYYY-MM 형식입니다").optional(),
  months: z.coerce.number().int().min(1).max(36).optional(),
});

// GET /api/v1/cash-plan?from=YYYY-MM&months=12 — 자금 계획: 월별 확정(받은 캐피탈콜 미납) + 추정(남은 약정 ÷ 남은 투자 기간) (L29) ⚠️
// 계산만 하고 저장하지 않는다. 기본: 이번 달부터 12개월
export const GET = withOrgUser(async (request, _ctx, user) => {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "검색 조건을 확인하세요");
  return ok(await getCashPlan(user.org_id, parsed.data.from ?? thisMonth(), parsed.data.months ?? 12));
});
