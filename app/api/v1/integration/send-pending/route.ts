import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { sendPendingResponses } from "@/lib/gp/responses";

// POST /api/v1/integration/send-pending — 못 보낸 응답 지금 보내기 (관리자, BR-SYNC-11)
// 우리 기관의 연동 제안 중 GP에 아직 전달하지 못한 것. GP가 거부한 것은 제외 (제안 화면에서 직접 다시 보낸다)
export const POST = withOrgUser(async (_request, _ctx, user) => ok(await sendPendingResponses(user.org_id, { type: "user", user })));
