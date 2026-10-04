import { ok } from "@/lib/api/response";
import { toErrorResponse } from "@/lib/api/handler";
import { verifyGpRequest } from "@/lib/gp/signed-request";
import { getBoardProgram, listBoardForGp } from "@/lib/services/board";

// GET /api/gp/v1/programs/{program_id} — GP용 공고 하나 (R8-1). 서명한 요청만
export async function GET(request: Request, ctx: RouteContext<"/api/gp/v1/programs/[program_id]">) {
  try {
    const { connectionId } = await verifyGpRequest(request);
    const p = await getBoardProgram((await ctx.params).program_id);
    const linked = (await listBoardForGp(connectionId, { org_id: p.org_id })).some((x) => x.id === p.id && x.linked);
    return ok({ ...p, linked });
  } catch (err) {
    return toErrorResponse(err);
  }
}
