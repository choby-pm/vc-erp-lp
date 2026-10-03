import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { listReconciliations } from "@/lib/services/commitment-ledger";

// GET /api/v1/commitments/{commitment_id}/reconciliations — 한 출자 건의 대사 이력 (최근 순, 추가만 되는 기록)
export const GET = withOrgUser<RouteContext<"/api/v1/commitments/[commitment_id]/reconciliations">>(async (_request, ctx, user) =>
  ok(await listReconciliations(user.org_id, (await ctx.params).commitment_id)),
);
