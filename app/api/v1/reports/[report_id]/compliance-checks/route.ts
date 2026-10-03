import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { complianceCheckSchema } from "@/lib/schemas/reports";
import { addComplianceCheck } from "@/lib/services/reports";

// POST /api/v1/reports/{report_id}/compliance-checks — 조건 준수 점검 기록 { actual_ratio?, memo? } (BR-CHK-01, L34)
// 연동 보고는 실제 비율을 GP 스냅샷에서 채운다. 필요 비율은 조합의 주목적 의무 비율. 투자 기간 중 미달은 "참고"로 보인다
export const POST = withOrgUser<RouteContext<"/api/v1/reports/[report_id]/compliance-checks">>(async (request, ctx, user) =>
  ok(await addComplianceCheck(user.org_id, user.id, (await ctx.params).report_id, await parseBody(request, complianceCheckSchema)), 201),
);
