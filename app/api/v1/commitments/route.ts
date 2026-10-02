import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { withOrgUser } from "@/lib/api/handler";
import { commitmentListQuerySchema } from "@/lib/schemas/commitments";
import { listCommitments } from "@/lib/services/commitments";

// GET /api/v1/commitments?status= — 출자 건 목록 (약정: 우리 장부·GP 원장 사본, 약정 대사 상태)
// 납입·분배·NAV·배수는 R4·R6에서 이 목록에 더한다
export const GET = withOrgUser(async (request, _ctx, user) => {
  const parsed = commitmentListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "검색 조건을 확인하세요");
  return ok(await listCommitments(user.org_id, parsed.data));
});
