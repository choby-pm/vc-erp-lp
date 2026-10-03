import { sql } from "@/lib/db";
import { AppError } from "@/lib/api/errors";
import { writeAudit, type AuditActor } from "@/lib/services/audit";

// GP 시스템 호출은 모두 이 파일을 거친다 (L16, 05 API 설계 4-5)
// · gpClient(orgId, gpId): 그 기관이 연결된 GP 출자자(gp_lp_id)를 gp_lp_links 에서 스스로 꺼내 주소 앞에 /lps/{gp_lp_id} 를 붙인다.
//   호출하는 코드는 lp_id 를 넘길 수 없다 → 다른 기관의 GP 데이터를 부를 길이 없다 (BR-ORG-05)
// · GP 주소·API 키는 환경 변수에서만 읽는다. DB에는 변수 이름만 있다 (L21, 🔗 GP D24)
// · 10초 제한. 연결 실패·시간 초과·GP 서버 오류는 GP_UNAVAILABLE 로 바꿔, 호출한 쪽이 "나중에 다시 보내기"로 처리한다 (BR-SYNC-10)
// · 호출마다 감사 로그를 남긴다 (BR-AUTH-04). 요청·응답 본문은 남기지 않는다

const TIMEOUT_MS = 10_000;

export type GpActor = { type: AuditActor; user?: { id: string; name: string; role: string; org_id: string } };
const SYSTEM: GpActor = { type: "system" };

type Connection = { id: string; name: string; base_url_env: string; api_key_env: string; webhook_secret_env: string };
export type GpLink = { gp_connection_id: string; gp_lp_id: string; gp_id: string; connection: Connection };

// 연결 설정의 환경 변수를 읽는다. 변수가 비어 있으면 운영자가 설정을 빠뜨린 것
export function connectionEnv(c: Pick<Connection, "name" | "base_url_env" | "api_key_env">) {
  const baseUrl = process.env[c.base_url_env]?.replace(/\/+$/, "");
  const apiKey = process.env[c.api_key_env];
  if (!baseUrl || !apiKey) {
    const missing = [!baseUrl && c.base_url_env, !apiKey && c.api_key_env].filter(Boolean).join(", ");
    throw new AppError(503, "GP_NOT_CONFIGURED", `GP 연동 환경 변수가 설정되지 않았습니다 (${c.name}: ${missing})`);
  }
  return { baseUrl, apiKey };
}

// 이 기관 × 이 운용사의 연동 연결. 없으면 GP_NOT_LINKED (BR-ORG-05)
export async function findLink(orgId: string, gpId: string): Promise<GpLink> {
  const [row] = await sql<(Omit<GpLink, "connection"> & { connection: Connection })[]>`
    select l.gp_connection_id, l.gp_lp_id, l.gp_id,
           json_build_object('id', c.id, 'name', c.name, 'base_url_env', c.base_url_env,
                             'api_key_env', c.api_key_env, 'webhook_secret_env', c.webhook_secret_env) as connection
    from gp_lp_links l join gp_connections c on c.id = l.gp_connection_id
    where l.org_id = ${orgId} and l.gp_id = ${gpId}
  `;
  if (!row) throw new AppError(409, "GP_NOT_LINKED", "이 운용사와 연동 설정이 되어 있지 않습니다", "BR-ORG-05");
  return row;
}

type CallOptions = { connection: Connection; orgId: string | null; gpId: string | null; actor: GpActor };

async function call<T>(method: "GET" | "PUT" | "POST", path: string, body: unknown, o: CallOptions): Promise<T> {
  const { baseUrl, apiKey } = connectionEnv(o.connection);
  const started = Date.now();
  let status = 0;
  let errorCode: string | null = null;
  try {
    let res: Response;
    try {
      res = await fetch(baseUrl + path, {
        method,
        headers: { Authorization: `Bearer ${apiKey}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (err) {
      errorCode = "GP_UNAVAILABLE";
      const reason = err instanceof Error && err.name === "TimeoutError" ? "10초 안에 답이 없습니다" : "연결하지 못했습니다";
      throw new AppError(503, "GP_UNAVAILABLE", `GP 시스템에 ${reason}`, "BR-SYNC-10");
    }
    status = res.status;
    const json = (await res.json().catch(() => null)) as { data?: T; meta?: unknown; error?: { code?: string; message?: string } } | null;
    if (res.ok && json && "data" in json) return json.data as T;

    const gpCode = json?.error?.code ?? `HTTP_${res.status}`;
    const gpMessage = json?.error?.message ?? "응답 형식이 올바르지 않습니다";
    const details = { gp_status: res.status, gp_code: gpCode, gp_message: gpMessage };
    if (res.status === 401 || res.status === 503) {
      errorCode = "GP_NOT_CONFIGURED";
      throw new AppError(503, "GP_NOT_CONFIGURED", `GP가 연동 요청을 받지 않았습니다: ${gpMessage}`, undefined, details);
    }
    if (res.status >= 500 || res.ok) {
      errorCode = "GP_UNAVAILABLE";
      throw new AppError(503, "GP_UNAVAILABLE", `GP 시스템 오류: ${gpMessage}`, "BR-SYNC-10", details);
    }
    // GP가 업무 규칙으로 거부 (예: 이미 거절된 제안). 다시 보내도 같은 결과라 재시도하지 않는다
    errorCode = "GP_REJECTED";
    throw new AppError(409, "GP_REJECTED", `GP가 요청을 거부했습니다: ${gpMessage}`, undefined, details);
  } finally {
    await writeAudit({
      actor_type: o.actor.type,
      user: o.actor.user ?? null,
      org_id: o.orgId,
      method,
      path: `/gp${path.split("?")[0]}`,
      status,
      error_code: errorCode,
      detail: { gp_connection_id: o.connection.id, gp_id: o.gpId, duration_ms: Date.now() - started },
    });
  }
}

// 파일 내려받기 (R5-2, L36): GP 응답을 그대로 흘려보낸다. JSON 이 아니라 본문 스트림이라 call() 을 쓰지 않는다
// 실패하면 call() 과 같은 오류 코드로 바꾼다. 감사 로그를 남긴다
async function download(path: string, o: CallOptions): Promise<Response> {
  const { baseUrl, apiKey } = connectionEnv(o.connection);
  const started = Date.now();
  let status = 0;
  try {
    let res: Response;
    try {
      res = await fetch(baseUrl + path, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(TIMEOUT_MS * 3), cache: "no-store" });
    } catch {
      throw new AppError(503, "GP_UNAVAILABLE", "GP 시스템에 연결하지 못했습니다", "BR-SYNC-10");
    }
    status = res.status;
    if (res.ok && res.body) return res;
    if (res.status === 404 || res.status === 403) throw new AppError(404, "NOT_FOUND", "GP에서 파일을 찾을 수 없습니다");
    throw new AppError(503, "GP_UNAVAILABLE", `GP 시스템 오류 (HTTP ${res.status})`, "BR-SYNC-10");
  } finally {
    await writeAudit({
      actor_type: o.actor.type,
      user: o.actor.user ?? null,
      org_id: o.orgId,
      method: "GET",
      path: `/gp${path}`,
      status,
      error_code: status >= 200 && status < 300 ? null : "GP_DOWNLOAD_FAILED",
      detail: { gp_connection_id: o.connection.id, gp_id: o.gpId, duration_ms: Date.now() - started },
    });
  }
}

// 기관 범위 호출: 주소는 /lps/{gp_lp_id} 뒤쪽만 넘긴다. 예) gp.get("/proposals")
export async function gpClient(orgId: string, gpId: string, actor: GpActor = SYSTEM) {
  const link = await findLink(orgId, gpId);
  const scoped = (path: string) => `/lps/${link.gp_lp_id}${path}`;
  const o: CallOptions = { connection: link.connection, orgId, gpId, actor };
  return {
    link,
    get: <T>(path: string) => call<T>("GET", scoped(path), undefined, o),
    put: <T>(path: string, body: unknown) => call<T>("PUT", scoped(path), body, o),
    post: <T>(path: string, body?: unknown) => call<T>("POST", scoped(path), body, o),
    download: (path: string) => download(scoped(path), o),
  };
}

// 연결 전체 호출: 특정 출자자에 속하지 않는 API만 (놓친 이벤트 가져오기 GET /events, BR-SYNC-08)
export async function gpConnectionClient(connectionId: string, actor: GpActor = SYSTEM) {
  const [connection] = await sql<Connection[]>`
    select id, name, base_url_env, api_key_env, webhook_secret_env from gp_connections where id = ${connectionId}
  `;
  if (!connection) throw new AppError(404, "NOT_FOUND", "GP 연동 설정을 찾을 수 없습니다");
  const o: CallOptions = { connection, orgId: null, gpId: null, actor };
  return {
    connection,
    events: <T>(after: string | null, limit = 100) =>
      call<T>("GET", `/events?limit=${limit}${after ? `&after=${after}` : ""}`, undefined, o),
  };
}

// 연결 설정 스크립트에서 쓰는 검증 호출: 아직 gp_lp_links 가 없을 때 이 GP 출자자 ID가 맞는지 확인한다
export async function verifyGpLp(connection: Connection, gpLpId: string) {
  return call<{ id: string; name: string; lp_type: string }>("GET", `/lps/${gpLpId}`, undefined, { connection, orgId: null, gpId: null, actor: SYSTEM });
}
