import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { reconResolveSchema } from "@/lib/schemas/commitments";
import { resolveReconciliation } from "@/lib/services/commitment-ledger";

// POST /api/v1/reconciliations/{recon_id}/resolve — 대사 불일치 확인 { resolution_memo } (출자 담당·관리자, BR-REC-05)
// 지금 상태인 불일치 행만. 덮어쓰지 않고 '확인 완료' 행을 추가한다. 숫자가 또 바뀌면 다시 판정된다
export const POST = withOrgUser<RouteContext<"/api/v1/reconciliations/[recon_id]/resolve">>(async (request, ctx, user) => {
  const { resolution_memo } = await parseBody(request, reconResolveSchema);
  return ok(await resolveReconciliation(user.org_id, user.id, (await ctx.params).recon_id, resolution_memo));
});
