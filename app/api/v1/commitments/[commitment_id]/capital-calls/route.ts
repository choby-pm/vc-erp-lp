import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { capitalCallCreateSchema } from "@/lib/schemas/capital-calls";
import { createManualCall, listCallsForCommitment } from "@/lib/services/capital-calls";
import { getCommitment } from "@/lib/services/commitments";

type Ctx = RouteContext<"/api/v1/commitments/[commitment_id]/capital-calls">;

// GET /api/v1/commitments/{commitment_id}/capital-calls — 이 출자 건의 캐피탈콜 (최근 회차 순)
export const GET = withOrgUser<Ctx>(async (_request, ctx, user) => {
  const { commitment_id } = await ctx.params;
  await getCommitment(user.org_id, commitment_id); // 다른 기관 출자 건이면 404
  return ok(await listCallsForCommitment(user.org_id, commitment_id));
});

// POST /api/v1/commitments/{commitment_id}/capital-calls — 수기 캐피탈콜 등록 { call_no?, call_date, due_date, call_amount, purpose }
// 수기 조합의 활성 출자 건만. 요청액 ≤ 남은 약정 (BR-CALL-02·03, BR-CMT-07)
export const POST = withOrgUser<Ctx>(async (request, ctx, user) => {
  const input = await parseBody(request, capitalCallCreateSchema);
  return ok(await createManualCall(user.org_id, user.id, (await ctx.params).commitment_id, input), 201);
});
