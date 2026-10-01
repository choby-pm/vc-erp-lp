import { after } from "next/server";
import { assertUuid } from "@/lib/api/errors";
import { toErrorResponse } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { receiveWebhook } from "@/lib/gp/inbox";
import { processExclusive } from "@/lib/gp/sync";
import { writeAudit } from "@/lib/services/audit";

// POST /api/webhooks/gp/{connection_id} — GP 웹훅 받기 (05 API 설계 4-3, BR-SYNC-01~03)
// 서명·시각 확인 → 인박스 저장 → 바로 200. 처리는 응답을 보낸 뒤 after() 로 시작한다 (L15). 놓친 것은 주기 작업이 처리
// · 이미 받은 이벤트, 연결 전에 생긴 이벤트도 200 (GP가 재전송을 멈추게)
// · 서명이 틀리면 401 이고 저장하지 않는다
export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/gp/[connection_id]">) {
  const { connection_id } = await ctx.params;
  const path = new URL(request.url).pathname;
  const rawBody = await request.text();
  let res: Response;
  let detail: Record<string, unknown> = { gp_event_id: request.headers.get("x-gp-event-id") };
  let orgId: string | null = null;
  try {
    assertUuid(connection_id, "GP 연동 설정을");
    const received = await receiveWebhook(connection_id, request.headers, rawBody);
    orgId = received.orgId;
    detail = { ...detail, event_type: received.event.event_type, result: received.result };
    res = ok({ result: received.result });
    if (received.result === "stored") after(() => processExclusive("auto").catch((err) => console.error("[gp webhook] 처리 실패", err)));
  } catch (err) {
    res = toErrorResponse(err);
  }
  const errorCode = res.status >= 400 ? (((await res.clone().json()) as { error?: { code?: string } }).error?.code ?? null) : null;
  await writeAudit({ actor_type: "gp_webhook", org_id: orgId, method: "POST", path, status: res.status, error_code: errorCode, detail, request });
  return res;
}
