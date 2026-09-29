import { sql } from "@/lib/db";

// 감사 로그 (BR-AUTH-04, 🔗 GP D42)
// · 모든 쓰기 요청, 로그인 시도(실패 포함), 받은 웹훅, GP로 보낸 요청을 남긴다
// · 요청 본문은 저장하지 않는다 (비밀번호 등). 무엇을 했는지는 주소 모양(action)과 결과 코드로 본다
// · 기관별로만 보인다 (org_id). 로그인 실패처럼 기관을 모르는 기록은 비워 둔다
// · 기록이 실패해도 본래 요청은 실패시키지 않는다 (로그는 부가 기능)

export type AuditActor = "user" | "gp_webhook" | "cron" | "system";
export type AuditEntry = {
  actor_type: AuditActor;
  user?: { id: string; name: string; role: string; org_id: string } | null;
  org_id?: string | null;
  method: string;
  path: string;
  status: number;
  error_code?: string | null;
  detail?: Record<string, unknown> | null;
  request?: Request;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /api/v1/proposals/{uuid}/stage → POST /proposals/:id/stage (숫자 구간은 :n)
export function actionOf(method: string, path: string) {
  const shape = path
    .replace(/^\/api\/v1/, "")
    .split("/")
    .map((s) => (UUID.test(s) ? ":id" : /^\d+$/.test(s) ? ":n" : s))
    .join("/");
  return `${method} ${shape}`;
}

export async function writeAudit(e: AuditEntry) {
  try {
    const forwarded = e.request?.headers.get("x-forwarded-for");
    await sql`
      insert into audit_logs (org_id, actor_type, user_id, user_name, user_role, method, path, action, status, error_code, detail, ip, user_agent)
      values (${e.user?.org_id ?? e.org_id ?? null}, ${e.actor_type}, ${e.user?.id ?? null}, ${e.user?.name ?? null}, ${e.user?.role ?? null},
              ${e.method}, ${e.path}, ${actionOf(e.method, e.path)}, ${e.status}, ${e.error_code ?? null},
              ${e.detail ? sql.json(e.detail as never) : null}, ${forwarded?.split(",")[0].trim() ?? null},
              ${e.request?.headers.get("user-agent")?.slice(0, 300) ?? null})
    `;
  } catch (err) {
    console.error("감사 로그 기록 실패", err);
  }
}
