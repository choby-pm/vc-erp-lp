import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { getCommitment } from "@/lib/services/commitments";

// GET /api/v1/commitments/{commitment_id} — 출자 건 상세 (선정 조건, 결성 정보, 약정·대사)
export const GET = withOrgUser<RouteContext<"/api/v1/commitments/[commitment_id]">>(async (_request, ctx, user) =>
  ok(await getCommitment(user.org_id, (await ctx.params).commitment_id)),
);
