import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { getBoardProgram } from "@/lib/services/board";

// GET /api/v1/board/{program_id} — 공고 하나 (게시판에 있는 것만: 접수 중 · 심사 중). 다른 기관 공고도 공고 항목은 보인다 (L50)
export const GET = withOrgUser<RouteContext<"/api/v1/board/[program_id]">>(async (_request, ctx, user) => {
  const p = await getBoardProgram((await ctx.params).program_id);
  return ok({ ...p, is_mine: p.org_id === user.org_id });
});
