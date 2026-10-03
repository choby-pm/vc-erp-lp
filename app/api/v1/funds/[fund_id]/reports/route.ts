import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { reportCreateSchema } from "@/lib/schemas/reports";
import { createManualReport, listReports } from "@/lib/services/reports";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/reports">;

// GET /api/v1/funds/{fund_id}/reports — 이 조합의 보고
export const GET = withOrgUser<Ctx>(async (_request, ctx, user) => ok(await listReports(user.org_id, { fund_id: (await ctx.params).fund_id })));

// POST /api/v1/funds/{fund_id}/reports — 수기 보고 등록 (BR-RPT-02·05). 같은 기간이면 is_correction: true 로만 (DUPLICATE_REPORT)
// 주목적 투자 비율을 넣으면 조건 점검도 함께 기록한다 (L34)
export const POST = withOrgUser<Ctx>(async (request, ctx, user) =>
  ok(await createManualReport(user.org_id, user.id, (await ctx.params).fund_id, await parseBody(request, reportCreateSchema)), 201),
);
