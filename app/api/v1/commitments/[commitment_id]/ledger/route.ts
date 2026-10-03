import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { getLedger } from "@/lib/services/commitment-ledger";

// GET /api/v1/commitments/{commitment_id}/ledger — 우리 장부와 GP 원장 사본을 나란히 (구분별 합계 + 지금 대사 상태)
// 수기 조합은 gp: null (대사 대상 아님, BR-REC-07)
export const GET = withOrgUser<RouteContext<"/api/v1/commitments/[commitment_id]/ledger">>(async (_request, ctx, user) =>
  ok(await getLedger(user.org_id, (await ctx.params).commitment_id)),
);
