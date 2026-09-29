import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { listAuditLogs } from "@/lib/services/audit";

// GET /api/v1/audit-logs?result=ok|fail|denied — 우리 기관 감사 로그 최근 200건 (관리자)
export const GET = withOrgUser(async (request, _ctx, user) => {
  const result = new URL(request.url).searchParams.get("result");
  return ok(await listAuditLogs(user.org_id, { result: result === "ok" || result === "fail" || result === "denied" ? result : undefined }));
});
