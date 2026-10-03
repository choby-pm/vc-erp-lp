import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { getMeeting } from "@/lib/services/meetings";

// GET /api/v1/meetings/{meeting_id} — 안건 + 검토 의견 + 우리 찬반 + 결재·제출 상태 + 결과
export const GET = withOrgUser<RouteContext<"/api/v1/meetings/[meeting_id]">>(async (_request, ctx, user) => ok(await getMeeting(user.org_id, (await ctx.params).meeting_id)));
