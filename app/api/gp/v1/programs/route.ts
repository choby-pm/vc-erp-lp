import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { toErrorResponse } from "@/lib/api/handler";
import { verifyGpRequest } from "@/lib/gp/signed-request";
import { boardQuerySchema } from "@/lib/schemas/board";
import { listBoardForGp } from "@/lib/services/board";

// GET /api/gp/v1/programs?strategy=&org_id=&status= — GP용 공고 게시판 (R8-1, L50 · GP D47)
// 연동 GP만 (웹훅과 같은 비밀 값으로 서명한 요청). 기관마다 이 GP와 연동됐는지 linked 로 알려준다 → 연동 기관은 GP ERP에서 지원, 아니면 접수 방법 안내
export async function GET(request: Request) {
  try {
    const { connectionId } = await verifyGpRequest(request);
    const q = boardQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!q.success) throw new AppError(400, "VALIDATION_ERROR", "조회 조건이 올바르지 않습니다");
    return ok({ items: await listBoardForGp(connectionId, q.data) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
