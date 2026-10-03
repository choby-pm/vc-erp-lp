import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { listMeetings } from "@/lib/services/meetings";

// GET /api/v1/meetings?votable=true&fund_id= — 총회 목록 (투표할 수 있는 것 우선)
export const GET = withOrgUser(async (request, _ctx, user) => {
  const q = new URL(request.url).searchParams;
  return ok(await listMeetings(user.org_id, { votable: q.get("votable") === "true", fund_id: q.get("fund_id") ?? undefined }));
});
