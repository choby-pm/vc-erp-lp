import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { withOrgUser } from "@/lib/api/handler";
import { listDistributions } from "@/lib/services/distributions";

// GET /api/v1/distributions?status=announced|received|all — 분배 목록 (기본: 수령 대기)
export const GET = withOrgUser(async (request, _ctx, user) => {
  const status = new URL(request.url).searchParams.get("status") ?? "announced";
  if (!["announced", "received", "all"].includes(status)) throw new AppError(400, "VALIDATION_ERROR", "검색 조건을 확인하세요");
  return ok(await listDistributions(user.org_id, { status: status as "announced" | "received" | "all" }));
});
