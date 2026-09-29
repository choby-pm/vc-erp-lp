import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { selectionTermsSchema } from "@/lib/schemas/approvals";
import { getSelectionTerms, putSelectionTerms } from "@/lib/services/selection";
import { getProposal } from "@/lib/services/proposals";

type Ctx = RouteContext<"/api/v1/proposals/[proposal_id]/selection-terms">;

// GET /api/v1/proposals/{proposal_id}/selection-terms — 선정 조건 (없으면 null)
export const GET = withOrgUser<Ctx>(async (_request, ctx, user) => {
  const { proposal_id } = await ctx.params;
  await getProposal(user.org_id, proposal_id); // 다른 기관 제안이면 "없음"
  return ok(await getSelectionTerms(user.org_id, proposal_id));
});

// PUT /api/v1/proposals/{proposal_id}/selection-terms — 선정 조건 저장 (결재 대기·승인 후에는 불가, BR-SEL-01, BR-APR-03)
export const PUT = withOrgUser<Ctx>(async (request, ctx, user) => {
  const input = await parseBody(request, selectionTermsSchema);
  return ok(await putSelectionTerms(user.org_id, user.id, (await ctx.params).proposal_id, input));
});
