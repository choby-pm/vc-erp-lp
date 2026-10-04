import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { toErrorResponse } from "@/lib/api/handler";
import { verifyGpRequest } from "@/lib/gp/signed-request";
import { applicationSchema, receiveApplication } from "@/lib/services/applications";
import { writeAudit } from "@/lib/services/audit";

// POST /api/gp/v1/applications — GP의 공고 지원 받기 { gp_proposal_id, gp_lp_id, program_id, track_id } (R8-3, L50~L54 · GP D47)
// 서명한 요청만(웹훅과 같은 비밀 값). 받은 시각이 접수 시각. 접수되면 200 { lp_proposal_id, received_at, result }
// 거부는 422 + 이유(LP_NOT_LINKED · CALL_NOT_FOUND · CALL_CLOSED · TRACK_NOT_FOUND · STRATEGY_MISMATCH …) → GP 화면에 그대로 보인다
export async function POST(request: Request) {
  const raw = await request.text();
  let res: Response;
  let orgId: string | null = null;
  try {
    const { connectionId } = await verifyGpRequest(request, raw);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new AppError(400, "VALIDATION_ERROR", "본문이 JSON이 아닙니다");
    }
    const parsed = applicationSchema.safeParse(body);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "지원 형식이 올바르지 않습니다 (gp_proposal_id · gp_lp_id · program_id · track_id)");
    const received = await receiveApplication(connectionId, parsed.data);
    orgId = received.org_id;
    res = ok({ lp_proposal_id: received.lp_proposal_id, received_at: received.received_at, result: received.result });
  } catch (err) {
    res = toErrorResponse(err);
  }
  // GP가 부른 요청도 감사 로그에 남긴다 (웹훅과 같은 행위자 종류)
  const errorCode = res.status >= 400 ? (((await res.clone().json()) as { error?: { code?: string } }).error?.code ?? null) : null;
  await writeAudit({ actor_type: "gp_webhook", org_id: orgId, method: "POST", path: "/api/gp/v1/applications", status: res.status, error_code: errorCode, request });
  return res;
}
