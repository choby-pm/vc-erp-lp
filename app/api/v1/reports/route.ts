import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { withOrgUser } from "@/lib/api/handler";
import { reportListQuerySchema } from "@/lib/schemas/reports";
import { listReports } from "@/lib/services/reports";

// GET /api/v1/reports?unreviewed=true&fund_id= — GP 보고 목록 (미검토 우선, 대체된 보고 표시, 최근 점검 결과)
export const GET = withOrgUser(async (request, _ctx, user) => {
  const parsed = reportListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "검색 조건을 확인하세요");
  return ok(await listReports(user.org_id, parsed.data));
});
