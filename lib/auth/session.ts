import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { sql } from "@/lib/db";
import type { Role } from "./roles";
import { SESSION_COOKIE } from "./session-cookie";

// DB 세션 방식 (🔗 GP D27)
// · 쿠키에는 무작위 토큰 원문, DB에는 그 SHA-256 지문만 저장한다
// · 매 요청마다 DB에서 세션을 확인하므로 로그아웃·계정 중지가 즉시 반영된다
// · 기관은 세션의 사용자에서만 정해진다 (BR-ORG-01). 주소·본문으로 받은 기관 ID는 쓰지 않는다

const SESSION_DAYS = 7;

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  org_id: string;
  org_name: string;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const userAgent = (await headers()).get("user-agent");

  await sql`
    insert into sessions (user_id, token_hash, expires_at, user_agent)
    values (${userId}, ${hashToken(token)}, ${expiresAt}, ${userAgent})
  `;

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // 브라우저 자바스크립트가 읽을 수 없다
    secure: process.env.NODE_ENV === "production", // 배포 환경에서는 HTTPS로만 전송
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

// 같은 요청 안에서 layout·page·API가 여러 번 불러도 DB는 한 번만 본다
export const getCurrentUser = cache(async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [user] = await sql<CurrentUser[]>`
    select u.id, u.email, u.name, u.role, u.org_id, o.name as org_name
    from sessions s
    join users u on u.id = s.user_id
    join orgs o on o.id = u.org_id
    where s.token_hash = ${hashToken(token)}
      and s.revoked_at is null
      and s.expires_at > now()
      and u.disabled_at is null  -- 계정이 중지되면 기존 세션도 즉시 무효
  `;
  return user ?? null;
});

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await sql`
      update sessions set revoked_at = now()
      where token_hash = ${hashToken(token)} and revoked_at is null
    `;
  }
  cookieStore.delete(SESSION_COOKIE);
}
