import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "@/lib/db";
import { AppError } from "@/lib/api/errors";
import { gpConnectionClient, type GpActor } from "@/lib/gp/client";
import { jobStatus } from "@/lib/services/jobs";

// GP 이벤트 받기 — 인박스 (R3-3, 03 DB 설계 4-12 inbound_events, 05 API 설계 4-3)
// · 웹훅: 서명 확인 → 5분 이내 → inbound_events 저장 → 바로 200. 처리는 따로 한다 (BR-SYNC-01~03, L15)
// · 놓친 이벤트: GP GET /events?after= 로 가져와 같은 인박스에 넣는다 (BR-SYNC-08)
// · 같은 이벤트는 (연결, GP 이벤트 ID) 유일 제약으로 한 번만 저장된다. 두 번째는 저장 없이 성공으로 답한다
// · 연결 전에 GP에서 생긴 이벤트는 저장하지 않는다. 연결 직후 첫 맞추기가 GP 현재 상태를 통째로 읽으므로
//   지난 이벤트를 하나씩 처리할 필요가 없다 (R3 계획 R3-4). GP에는 받았다고(200) 답해 재전송을 멈춘다

export const SYNC_JOB = "gp_sync";
export const MAX_SKEW_MS = 5 * 60_000;
const PULL_PAGE = 100;
const PULL_MAX_PAGES = 20;

// GP가 보내는 이벤트 모양 (🔗 GP 05 API 설계 6-1). 웹훅 본문과 GET /events 의 항목이 같다
export type GpEvent = {
  id: string;
  event_type: string;
  occurred_at: string;
  lp_id: string | null;
  fund_id: string | null;
  data: Record<string, unknown>;
};

type Connection = { id: string; name: string; webhook_secret_env: string; created_at: Date };
export type StoreResult = "stored" | "duplicate" | "before_link";

export async function loadConnection(connectionId: string): Promise<Connection> {
  const [c] = await sql<Connection[]>`select id, name, webhook_secret_env, created_at from gp_connections where id = ${connectionId}`;
  if (!c) throw new AppError(404, "NOT_FOUND", "GP 연동 설정을 찾을 수 없습니다");
  return c;
}

// 🔗 GP signWebhook: sha256=HMAC-SHA256(비밀 값, 타임스탬프 + "." + 본문)
export function signatureOf(secret: string, timestamp: string, body: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function sameSignature(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function storeEvent(connection: Connection, e: GpEvent, via: "webhook" | "pull"): Promise<StoreResult> {
  if (new Date(e.occurred_at).getTime() < new Date(connection.created_at).getTime()) return "before_link";
  const [row] = await sql`
    insert into inbound_events (gp_connection_id, gp_event_id, event_type, gp_lp_id, gp_fund_id, occurred_at, payload, received_via)
    values (${connection.id}, ${e.id}, ${e.event_type}, ${e.lp_id}, ${e.fund_id}, ${e.occurred_at}, ${sql.json(e as never)}, ${via})
    on conflict (gp_connection_id, gp_event_id) do nothing
    returning id
  `;
  return row ? "stored" : "duplicate";
}

// ─── 웹훅 ──────────────────────────────────────────────────────────────────

export type WebhookResult = { event: GpEvent; result: StoreResult; orgId: string | null };

// 검증에 실패하면 401 (저장 안 함, BR-SYNC-01). 본문은 서명 확인 전에 해석하지 않는다
export async function receiveWebhook(connectionId: string, headers: Headers, rawBody: string): Promise<WebhookResult> {
  const connection = await loadConnection(connectionId);
  const secret = process.env[connection.webhook_secret_env];
  if (!secret) throw new AppError(503, "GP_NOT_CONFIGURED", `웹훅 서명 비밀 값 환경 변수가 비어 있습니다 (${connection.webhook_secret_env})`);

  const timestamp = headers.get("x-gp-timestamp") ?? "";
  const signature = headers.get("x-gp-signature") ?? "";
  const eventId = headers.get("x-gp-event-id") ?? "";
  const unauthorized = (message: string) => new AppError(401, "INVALID_SIGNATURE", message, "BR-SYNC-01");

  if (!timestamp || !signature || !sameSignature(signature, signatureOf(secret, timestamp, rawBody))) throw unauthorized("서명이 맞지 않습니다");
  const sentAt = Date.parse(timestamp);
  if (Number.isNaN(sentAt) || Math.abs(Date.now() - sentAt) > MAX_SKEW_MS) throw unauthorized("타임스탬프가 5분 범위를 벗어났습니다");

  let event: GpEvent;
  try {
    event = JSON.parse(rawBody) as GpEvent;
  } catch {
    throw new AppError(400, "VALIDATION_ERROR", "본문이 JSON이 아닙니다");
  }
  if (!event?.id || event.id !== eventId || !event.event_type || !event.occurred_at) {
    throw new AppError(400, "VALIDATION_ERROR", "이벤트 형식이 올바르지 않습니다 (id, event_type, occurred_at, X-GP-Event-Id)");
  }

  const result = await storeEvent(connection, event, "webhook");
  // 감사 로그를 기관별로 보이게, 출자자 이벤트면 연결된 기관을 찾아 둔다 (조합 전체 이벤트는 기관 없음)
  const [link] = event.lp_id
    ? await sql<{ org_id: string }[]>`select org_id from gp_lp_links where gp_connection_id = ${connection.id} and gp_lp_id = ${event.lp_id}`
    : [];
  return { event, result, orgId: link?.org_id ?? null };
}

// ─── 놓친 이벤트 가져오기 ───────────────────────────────────────────────────

export type PullResult = { connection: string; fetched: number; stored: number; duplicate: number; before_link: number; error?: string };

// 연결 하나: 마지막으로 가져온 위치 뒤부터 페이지 단위로 끝까지 (한 번에 최대 2,000건)
export async function pullConnection(connectionId: string, actor?: GpActor): Promise<PullResult> {
  const connection = await loadConnection(connectionId);
  const client = await gpConnectionClient(connectionId, actor);
  const [{ last_gp_event_id }] = await sql<{ last_gp_event_id: string | null }[]>`select last_gp_event_id from gp_connections where id = ${connectionId}`;
  const result: PullResult = { connection: connection.name, fetched: 0, stored: 0, duplicate: 0, before_link: 0 };

  let cursor = last_gp_event_id;
  for (let page = 0; page < PULL_MAX_PAGES; page++) {
    const events = await client.events<GpEvent[]>(cursor, PULL_PAGE);
    for (const e of events) {
      result.fetched++;
      result[await storeEvent(connection, e, "pull")]++;
    }
    if (events.length > 0) {
      cursor = events[events.length - 1].id;
      await sql`update gp_connections set last_gp_event_id = ${cursor} where id = ${connectionId}`;
    }
    if (events.length < PULL_PAGE) break;
  }
  await sql`update gp_connections set last_pulled_at = now() where id = ${connectionId}`;
  return result;
}

export async function allConnectionIds() {
  return (await sql<{ id: string }[]>`select id from gp_connections order by created_at`).map((c) => c.id);
}

export const syncJobStatus = () => jobStatus(SYNC_JOB);
