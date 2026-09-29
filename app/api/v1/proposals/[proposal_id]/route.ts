import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { proposalUpdateSchema } from "@/lib/schemas/proposals";
import { getProposal, updateProposal } from "@/lib/services/proposals";

type Ctx = RouteContext<"/api/v1/proposals/[proposal_id]">;

// GET /api/v1/proposals/{proposal_id} — 제안 상세 (단계 이력, 평가 가능한 단계, 결재 대기 여부)
export const GET = withOrgUser<Ctx>(async (_request, ctx, user) => ok(await getProposal(user.org_id, (await ctx.params).proposal_id)));

// PATCH /api/v1/proposals/{proposal_id} — 요청액·접수일·메모 수정 (결정 전, 결재 대기 아닐 때)
export const PATCH = withOrgUser<Ctx>(async (request, ctx, user) => {
  const input = await parseBody(request, proposalUpdateSchema);
  return ok(await updateProposal(user.org_id, (await ctx.params).proposal_id, input));
});
