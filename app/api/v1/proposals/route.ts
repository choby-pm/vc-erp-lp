import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { proposalCreateSchema, proposalListQuerySchema } from "@/lib/schemas/proposals";
import { createProposal, listProposals } from "@/lib/services/proposals";

// GET /api/v1/proposals?status=&program_id=&channel= — 출자 제안 목록 (status=open 진행 중, closed 결정됨)
export const GET = withOrgUser(async (request, _ctx, user) => {
  const parsed = proposalListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "검색 조건을 확인하세요");
  return ok(await listProposals(user.org_id, parsed.data));
});

// POST /api/v1/proposals — 수기 제안 등록. 조합은 기존 것(fund_id)이거나 새로 만든다(new_fund) (BR-PROP-01·02, BR-PRG-04, L18)
export const POST = withOrgUser(async (request, _ctx, user) => {
  const input = await parseBody(request, proposalCreateSchema);
  return ok(await createProposal(user.org_id, user.id, input), 201);
});
