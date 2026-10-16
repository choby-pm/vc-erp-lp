import { withOrgUser, parseBody } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import {
  requestInput,
  createLocalRequest,
  listLocalRequests,
  syncReportRequests,
} from "@/lib/services/report-requests";
type C = RouteContext<"/api/v1/funds/[fund_id]/report-requests">;
export const GET = withOrgUser<C>(async (_r, c, u) =>
  ok(await listLocalRequests(u.org_id, (await c.params).fund_id)),
);
export const POST = withOrgUser<C>(async (r, c, u) =>
  ok(
    await createLocalRequest(
      u.org_id,
      (await c.params).fund_id,
      await parseBody(r, requestInput),
      u,
    ),
    201,
  ),
);
export const PUT = withOrgUser<C>(async (_r, c, u) =>
  ok(
    await syncReportRequests(u.org_id, (await c.params).fund_id, {
      type: "user",
      user: u,
    }),
  ),
);
