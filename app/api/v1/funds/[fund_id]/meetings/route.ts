import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { manualMeetingSchema } from "@/lib/schemas/meetings";
import { createManualMeeting, listMeetings } from "@/lib/services/meetings";

type Ctx = RouteContext<"/api/v1/funds/[fund_id]/meetings">;

// GET /api/v1/funds/{fund_id}/meetings — 이 조합의 총회
export const GET = withOrgUser<Ctx>(async (_request, ctx, user) => ok(await listMeetings(user.org_id, { fund_id: (await ctx.params).fund_id })));

// POST /api/v1/funds/{fund_id}/meetings — 수기 총회·안건 등록 (우편·메일로 받은 소집 통지). 연동 조합은 GP_MANAGED_FIELD
export const POST = withOrgUser<Ctx>(async (request, ctx, user) =>
  ok(await createManualMeeting(user.org_id, user.id, (await ctx.params).fund_id, await parseBody(request, manualMeetingSchema)), 201),
);
