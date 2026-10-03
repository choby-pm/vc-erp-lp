import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { meetingResultsSchema } from "@/lib/schemas/meetings";
import { recordManualResults } from "@/lib/services/meetings";

// POST /api/v1/meetings/{meeting_id}/results — 수기 총회 결과 기록 { results: [{ agenda_id, result }] } → 개최 완료. 연동 총회는 GP에서
export const POST = withOrgUser<RouteContext<"/api/v1/meetings/[meeting_id]/results">>(async (request, ctx, user) =>
  ok(await recordManualResults(user.org_id, (await ctx.params).meeting_id, await parseBody(request, meetingResultsSchema))),
);
