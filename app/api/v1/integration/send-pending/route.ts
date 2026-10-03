import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { sendPendingResponses } from "@/lib/gp/responses";
import { sendPendingAcks } from "@/lib/services/notices";
import { sendPendingVotes } from "@/lib/services/meetings";

// POST /api/v1/integration/send-pending — 못 보낸 것 지금 보내기 (관리자, BR-SYNC-11)
// · 출자 제안 응답: GP에 아직 전달하지 못한 것. GP가 거부한 것은 제외 (제안 화면에서 직접 다시 보낸다)
// · 통지 확인 (R5-1) · 승인된 투표 (R5-3)
export const POST = withOrgUser(async (_request, _ctx, user) => {
  const actor = { type: "user" as const, user };
  const responses = await sendPendingResponses(user.org_id, actor);
  const acks = await sendPendingAcks(user.org_id, actor);
  const votes = await sendPendingVotes(user.org_id, actor);
  return ok({ ...responses, acks, votes });
});
