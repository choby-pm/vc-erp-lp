import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { distributionCreateSchema } from "@/lib/schemas/distributions";
import { getCommitment } from "@/lib/services/commitments";
import { createManualDistribution, listDistributions } from "@/lib/services/distributions";

type Ctx = RouteContext<"/api/v1/commitments/[commitment_id]/distributions">;

// GET /api/v1/commitments/{commitment_id}/distributions — 이 출자 건의 분배 (전체)
export const GET = withOrgUser<Ctx>(async (_request, ctx, user) => {
  const { commitment_id } = await ctx.params;
  await getCommitment(user.org_id, commitment_id);
  return ok(await listDistributions(user.org_id, { status: "all", commitment_id }));
});

// POST /api/v1/commitments/{commitment_id}/distributions — 수기 분배 { distribution_no?, distribution_date, return_of_capital_amount, profit_amount, is_final } (BR-DIST-02)
export const POST = withOrgUser<Ctx>(async (request, ctx, user) =>
  ok(await createManualDistribution(user.org_id, user.id, (await ctx.params).commitment_id, await parseBody(request, distributionCreateSchema)), 201),
);
