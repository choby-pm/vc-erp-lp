import { rejectUnlessCron } from "@/lib/api/cron";
import { toErrorResponse } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { allConnectionIds } from "@/lib/gp/inbox";
import { sendPendingResponses } from "@/lib/gp/responses";
import { sendPendingAcks } from "@/lib/services/notices";
import { sendPendingVotes } from "@/lib/services/meetings";
import { pullAndProcessExclusive } from "@/lib/gp/sync";
import { writeAudit } from "@/lib/services/audit";

// GET /api/cron/sync — Vercel Cron 이 부르는 GP 동기화 주기 작업 (05 API 설계 6장)
// 모든 연결의 놓친 이벤트 가져오기 + 받은 이벤트 처리·재시도 (R3-4) + 못 보낸 제안 응답 보내기 (R3-5, BR-SYNC-11)
export async function GET(request: Request) {
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;
  let res: Response;
  try {
    const synced = await pullAndProcessExclusive(await allConnectionIds(), "cron", { type: "cron" });
    const result = {
      ...synced,
      responses: await sendPendingResponses(null, { type: "cron" }),
      acks: await sendPendingAcks(null, { type: "cron" }), // 못 보낸 통지 확인 (R5-1)
      votes: await sendPendingVotes(null, { type: "cron" }), // 승인됐는데 못 보낸 투표 (R5-3)
    };
    res = ok(result);
    await writeAudit({ actor_type: "cron", method: "GET", path: "/api/cron/sync", status: 200, detail: result, request });
  } catch (err) {
    res = toErrorResponse(err);
    await writeAudit({ actor_type: "cron", method: "GET", path: "/api/cron/sync", status: res.status, request });
  }
  return res;
}
