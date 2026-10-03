import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { getNotice } from "@/lib/services/notices";

// GET /api/v1/notices/{notice_id} — 통지 상세
export const GET = withOrgUser<RouteContext<"/api/v1/notices/[notice_id]">>(async (_request, ctx, user) => ok(await getNotice(user.org_id, (await ctx.params).notice_id)));
