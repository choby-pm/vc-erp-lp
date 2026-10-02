import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { linkedProposalUpdateSchema, proposalUpdateSchema } from "@/lib/schemas/proposals";
import { getProposal, updateLinkedProposal, updateProposal } from "@/lib/services/proposals";

type Ctx = RouteContext<"/api/v1/proposals/[proposal_id]">;

// GET /api/v1/proposals/{proposal_id} — 제안 상세 (단계 이력, 평가 가능한 단계, 결재 대기 여부, GP 응답 상태)
export const GET = withOrgUser<Ctx>(async (_request, ctx, user) => ok(await getProposal(user.org_id, (await ctx.params).proposal_id)));

// PATCH /api/v1/proposals/{proposal_id} — 결정 전, 결재 대기 아닐 때
// · 수기 제안: { requested_amount, received_date, memo }
// · 연동 제안: { program_track_id, memo } — 금액·접수일은 GP 값 (BR-COM-05, BR-PROP-03)
export const PATCH = withOrgUser<Ctx>(async (request, ctx, user) => {
  const { proposal_id } = await ctx.params;
  const p = await getProposal(user.org_id, proposal_id);
  if (p.data_source === "gp_api") {
    return ok(await updateLinkedProposal(user.org_id, proposal_id, await parseBody(request, linkedProposalUpdateSchema)));
  }
  return ok(await updateProposal(user.org_id, proposal_id, await parseBody(request, proposalUpdateSchema)));
});
