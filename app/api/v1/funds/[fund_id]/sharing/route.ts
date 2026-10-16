import { withOrgUser } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { fetchFundSharing } from "@/lib/services/sharing";
export const GET = withOrgUser<RouteContext<"/api/v1/funds/[fund_id]/sharing">>(
  async (_r, c, u) =>
    ok(
      await fetchFundSharing(u.org_id, (await c.params).fund_id, {
        type: "user",
        user: u,
      }),
    ),
);
