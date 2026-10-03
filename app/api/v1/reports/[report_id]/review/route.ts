import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { reviewReport } from "@/lib/services/reports";

// POST /api/v1/reports/{report_id}/review — 검토 완료 (BR-RPT-04). 두 번 해도 처음 시각·검토자 유지
export const POST = withOrgUser<RouteContext<"/api/v1/reports/[report_id]/review">>(async (_request, ctx, user) =>
  ok(await reviewReport(user.org_id, user.id, (await ctx.params).report_id)),
);
