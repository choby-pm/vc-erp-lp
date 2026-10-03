import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { getReport } from "@/lib/services/reports";

// GET /api/v1/reports/{report_id} — 보고 상세 (연동이면 GP 스냅샷 그대로, PDF 목록, 점검 이력)
export const GET = withOrgUser<RouteContext<"/api/v1/reports/[report_id]">>(async (_request, ctx, user) => ok(await getReport(user.org_id, (await ctx.params).report_id)));
