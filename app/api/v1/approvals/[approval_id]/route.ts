import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { getApproval } from "@/lib/services/approvals";

// GET /api/v1/approvals/{approval_id} — 결재 상세 (기안 시점 스냅샷, BR-APR-04)
export const GET = withOrgUser<RouteContext<"/api/v1/approvals/[approval_id]">>(async (_request, ctx, user) =>
  ok(await getApproval(user.org_id, (await ctx.params).approval_id)),
);
