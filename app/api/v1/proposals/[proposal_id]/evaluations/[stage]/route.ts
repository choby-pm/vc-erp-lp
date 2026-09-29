import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { evaluationSchema, evaluationStageSchema } from "@/lib/schemas/proposals";
import { saveMyEvaluation } from "@/lib/services/evaluations";

// PUT /api/v1/proposals/{proposal_id}/evaluations/{stage} — 내 평가표 저장 { scores, opinion, evaluated_date? }
// 출자 담당·결재권자·관리자 모두 심사위원이 될 수 있다. 쓴 사람만 고친다 (BR-EVAL-02~04)
export const PUT = withOrgUser<RouteContext<"/api/v1/proposals/[proposal_id]/evaluations/[stage]">>(async (request, ctx, user) => {
  const { proposal_id, stage } = await ctx.params;
  const parsedStage = evaluationStageSchema.safeParse(stage);
  if (!parsedStage.success) throw new AppError(404, "NOT_FOUND", "심사 단계를 찾을 수 없습니다");
  const input = await parseBody(request, evaluationSchema);
  return ok(await saveMyEvaluation(user.org_id, user.id, proposal_id, parsedStage.data, input));
});
