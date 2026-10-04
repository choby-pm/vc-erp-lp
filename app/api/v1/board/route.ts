import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { withOrgUser } from "@/lib/api/handler";
import { boardQuerySchema } from "@/lib/schemas/board";
import { listBoard } from "@/lib/services/board";

// GET /api/v1/board?strategy=&org_id=&status= — 출자사업 공고 게시판 (R8-1, L50). 로그인한 모든 기관 사용자가 전 기관의 공고를 본다
// 기관 분리의 예외: 공고 항목만 (예산 · 접수 현황 없음). 내 기관 공고에는 is_mine
export const GET = withOrgUser(async (request, _ctx, user) => {
  const q = boardQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!q.success) throw new AppError(400, "VALIDATION_ERROR", "조회 조건이 올바르지 않습니다");
  const items = (await listBoard(q.data)).map((p) => ({ ...p, is_mine: p.org_id === user.org_id }));
  return ok({ items });
});
