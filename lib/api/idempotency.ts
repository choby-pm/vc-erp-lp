import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { AppError } from "./errors";

// 중복 요청 방지 (05 API 설계 2장, L13 — 🔗 GP D22와 같은 방식)
// 돈·결재가 걸린 POST 는 화면이 만든 Idempotency-Key 헤더를 보낸다.
//   · 같은 키로 다시 오면 다시 처리하지 않고 처음 응답을 그대로 돌려준다
//   · 같은 키인데 내용이 다르면 409 IDEMPOTENCY_KEY_REUSED
//   · 성공 응답(2xx)만 저장한다. 실패는 고쳐서 같은 키로 다시 보낼 수 있다
//   · 키는 24시간 보관한다
// 같은 사용자·같은 키의 동시 요청은 advisory lock 으로 한 번에 하나만 처리한다.

export async function idempotent(
  request: Request,
  user: { id: string; org_id: string },
  handler: (body: unknown) => Promise<Response>,
): Promise<Response> {
  const key = request.headers.get("Idempotency-Key")?.trim();
  if (!key || key.length > 200) {
    throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "중복 처리를 막기 위한 Idempotency-Key 헤더가 필요합니다");
  }

  const text = await request.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = null;
  }
  const endpoint = `${request.method} ${new URL(request.url).pathname}`;
  const hash = createHash("sha256").update(`${endpoint}\n${text}`).digest("hex");

  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${`${user.id}:${key}`}))`;
    const [saved] = await tx<{ request_hash: string; response_status: number; response_body: unknown }[]>`
      select request_hash, response_status, response_body from idempotency_keys
      where key = ${key} and user_id = ${user.id} and created_at > now() - interval '24 hours'
    `;
    if (saved) {
      if (saved.request_hash !== hash) {
        throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "같은 Idempotency-Key 로 다른 요청을 보냈습니다. 새 키를 쓰세요");
      }
      return NextResponse.json(saved.response_body, { status: saved.response_status, headers: { "Idempotent-Replayed": "true" } });
    }

    const response = await handler(body);
    if (response.ok) {
      const responseBody = await response.clone().json();
      await tx`delete from idempotency_keys where key = ${key} and user_id = ${user.id}`; // 24시간 지난 옛 키
      await tx`
        insert into idempotency_keys (key, user_id, org_id, endpoint, request_hash, response_status, response_body)
        values (${key}, ${user.id}, ${user.org_id}, ${endpoint}, ${hash}, ${response.status}, ${tx.json(responseBody as never)})
      `;
    }
    return response;
  });
}
