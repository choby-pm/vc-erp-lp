import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { acknowledgeNotice } from "@/lib/services/notices";

// POST /api/v1/notices/{notice_id}/acknowledge — 통지 확인 (BR-NTC-02). 두 번 해도 처음 확인 시각·확인자 유지
// 연동이면 저장 뒤 GP에 "확인함" 전달 → 응답 gp_sync { status: sent | pending | not_needed }. 못 보내면 나중에 다시 보낸다 (BR-SYNC-11)
export const POST = withOrgUser<RouteContext<"/api/v1/notices/[notice_id]/acknowledge">>(async (_request, ctx, user) =>
  ok(await acknowledgeNotice(user.org_id, user.id, (await ctx.params).notice_id, { type: "user", user })),
);
