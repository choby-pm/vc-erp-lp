import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { listInboundEvents, type InboundStatus } from "@/lib/services/integration";

const STATUSES: InboundStatus[] = ["received", "processed", "failed", "ignored"];

// GET /api/v1/integration/events?status= — 우리 기관 관련 받은 이벤트 최근 100건 (관리자, BR-SYNC-07)
export const GET = withOrgUser(async (request, _ctx, user) => {
  const status = new URL(request.url).searchParams.get("status") as InboundStatus | null;
  return ok(await listInboundEvents(user.org_id, status && STATUSES.includes(status) ? status : null));
});
