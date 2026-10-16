import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { withOrgUser } from "@/lib/api/handler";
import { commitmentPerformance } from "@/lib/services/performance";
import { AS_OF_ERROR, performanceDate } from "@/lib/performance-date";

// GET /api/v1/commitments/{commitment_id}/performance?as_of=YYYY-MM-DD — 출자 건 성과 + 현금흐름 목록 (IRR 근거) (BR-PERF-01~04, L40)
// 우리 장부 기준, 저장하지 않음. 평가액은 조정 평가액 (최근 보고 + 이후 납입 − 이후 분배)
export const GET = withOrgUser<RouteContext<"/api/v1/commitments/[commitment_id]/performance">>(async (request, ctx, user) => {
  const q = new URL(request.url).searchParams;
  const asOf = performanceDate(q.getAll("as_of").length > 1 ? q.getAll("as_of") : q.get("as_of"));
  if (!asOf) throw new AppError(400, "VALIDATION_ERROR", AS_OF_ERROR);
  return ok(await commitmentPerformance(user.org_id, (await ctx.params).commitment_id, asOf));
});
