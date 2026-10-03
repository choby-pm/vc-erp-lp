import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { withOrgUser } from "@/lib/api/handler";
import { commitmentPerformance, todayKst } from "@/lib/services/performance";

// GET /api/v1/commitments/{commitment_id}/performance?as_of=YYYY-MM-DD — 출자 건 성과 + 현금흐름 목록 (IRR 근거) (BR-PERF-01~04, L40)
// 우리 장부 기준, 저장하지 않음. 평가액은 조정 평가액 (최근 보고 + 이후 납입 − 이후 분배)
export const GET = withOrgUser<RouteContext<"/api/v1/commitments/[commitment_id]/performance">>(async (request, ctx, user) => {
  const asOf = new URL(request.url).searchParams.get("as_of") ?? todayKst();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(asOf))) throw new AppError(400, "VALIDATION_ERROR", "기준일은 YYYY-MM-DD 형식입니다");
  return ok(await commitmentPerformance(user.org_id, (await ctx.params).commitment_id, asOf));
});
