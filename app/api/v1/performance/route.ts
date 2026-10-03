import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { withOrgUser } from "@/lib/api/handler";
import { portfolioPerformance, todayKst, type GroupBy } from "@/lib/services/performance";

const GROUPS: GroupBy[] = ["vintage", "strategy", "gp", "source"];

// GET /api/v1/performance?as_of=&group_by=vintage|strategy|gp|source — 포트폴리오 합계와 묶음별 TVPI·DPI·RVPI·IRR (05 4-4, BR-PERF-05·06)
// 배수는 금액 합계로 다시 나누고 IRR은 현금흐름을 합쳐 한 번. 결성 대기·취소 제외
export const GET = withOrgUser(async (request, _ctx, user) => {
  const q = new URL(request.url).searchParams;
  const asOf = q.get("as_of") ?? todayKst();
  const groupBy = (q.get("group_by") ?? "vintage") as GroupBy;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(asOf))) throw new AppError(400, "VALIDATION_ERROR", "기준일은 YYYY-MM-DD 형식입니다");
  if (!GROUPS.includes(groupBy)) throw new AppError(400, "VALIDATION_ERROR", "group_by 는 vintage · strategy · gp · source 중 하나입니다");
  return ok(await portfolioPerformance(user.org_id, asOf, groupBy));
});
