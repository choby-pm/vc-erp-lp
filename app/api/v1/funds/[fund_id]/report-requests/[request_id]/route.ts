import { z } from "zod";
import { withOrgUser, parseBody } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import {
  cancelLocalRequest,
  deliverReportRequest,
} from "@/lib/services/report-requests";
const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cancel"),
    reason: z.string().trim().min(1).max(2000),
  }),
  z.object({ action: z.literal("retry") }),
]);
export const POST = withOrgUser<
  RouteContext<"/api/v1/funds/[fund_id]/report-requests/[request_id]">
>(async (r, c, u) => {
  const p = await c.params,
    v = await parseBody(r, input),
    actor = { type: "user" as const, user: u };
  return ok(
    v.action === "cancel"
      ? await cancelLocalRequest(
          u.org_id,
          p.fund_id,
          p.request_id,
          v.reason,
          actor,
        )
      : await deliverReportRequest(u.org_id, p.fund_id, p.request_id, actor),
  );
});
