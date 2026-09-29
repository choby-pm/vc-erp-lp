import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { withOrgUser } from "@/lib/api/handler";
import { approvalListQuerySchema } from "@/lib/schemas/approvals";
import { listApprovals } from "@/lib/services/approvals";

// GET /api/v1/approvals?box=to_me|mine|all&status=pending|approved|rejected|all — 결재함
export const GET = withOrgUser(async (request, _ctx, user) => {
  const parsed = approvalListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "검색 조건을 확인하세요");
  return ok(await listApprovals(user.org_id, user.id, parsed.data));
});
