import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { withOrgUser } from "@/lib/api/handler";
import { capitalCallListQuerySchema } from "@/lib/schemas/capital-calls";
import { listCapitalCalls } from "@/lib/services/capital-calls";

// GET /api/v1/capital-calls?status=unpaid|overdue|all&commitment_id= — 모든 출자 건의 캐피탈콜 (우리 쪽 납입 상태 계산, BR-CALL-05)
// 기본은 unpaid (아직 다 내지 않은 것, 기한 순)
export const GET = withOrgUser(async (request, _ctx, user) => {
  const parsed = capitalCallListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "검색 조건을 확인하세요");
  return ok(await listCapitalCalls(user.org_id, parsed.data));
});
