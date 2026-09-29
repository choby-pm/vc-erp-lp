import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import type { Role } from "@/lib/auth/roles";

// 기관 · 사용자 (R1-1)
// 모든 함수는 기관 ID를 첫 인자로 받고, 모든 쿼리에 org_id 조건을 붙인다 (BR-ORG-02).
// 다른 기관의 사용자 ID로 요청하면 "없음"이다 (BR-ORG-03)

export type OrgUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  disabled_at: Date | null;
  created_at: Date;
  last_login_at: Date | null;
};

export async function getOrg(orgId: string) {
  const [org] = await sql<{ id: string; name: string; org_type: string }[]>`select id, name, org_type from orgs where id = ${orgId}`;
  if (!org) throw notFound("기관을");
  return org;
}

export async function updateOrg(orgId: string, input: { name: string }) {
  const [org] = await sql<{ id: string; name: string }[]>`update orgs set name = ${input.name} where id = ${orgId} returning id, name`;
  return org;
}

export async function listUsers(orgId: string) {
  return sql<OrgUser[]>`
    select u.id, u.email, u.name, u.role, u.disabled_at, u.created_at,
           (select max(s.created_at) from sessions s where s.user_id = u.id) as last_login_at
    from users u
    where u.org_id = ${orgId}
    order by u.disabled_at is not null, u.created_at
  `;
}

async function loadUser(orgId: string, userId: string) {
  assertUuid(userId, "사용자를");
  const [user] = await sql<{ id: string; role: Role; disabled_at: Date | null }[]>`
    select id, role, disabled_at from users where id = ${userId} and org_id = ${orgId}
  `;
  if (!user) throw notFound("사용자를");
  return user;
}

// 새 사용자: 임시 비밀번호를 만들어 이 응답에서만 돌려준다 (🔗 GP BR-STF-03)
export async function createUser(orgId: string, input: { email: string; name: string; role: Role }) {
  const [exists] = await sql`select 1 from users where email = ${input.email}`;
  // 이메일은 서비스 전체에서 유일하다. 다른 기관 사용자일 수도 있으므로 어느 기관인지는 알려주지 않는다
  if (exists) throw new AppError(409, "DUPLICATE_EMAIL", "이미 사용 중인 이메일입니다", "BR-AUTH-05");

  const tempPassword = generateTempPassword();
  const [user] = await sql<{ id: string; email: string; name: string; role: Role }[]>`
    insert into users (org_id, email, name, role, password_hash)
    values (${orgId}, ${input.email}, ${input.name}, ${input.role}, ${await hashPassword(tempPassword)})
    returning id, email, name, role
  `;
  return { user, temp_password: tempPassword };
}

export async function updateUser(orgId: string, userId: string, input: { name: string }) {
  await loadUser(orgId, userId);
  const [user] = await sql`update users set name = ${input.name} where id = ${userId} and org_id = ${orgId} returning id, name`;
  return user;
}

// BR-AUTH-03: 자기 권한은 바꿀 수 없다 → 관리자가 0명이 되지 않는다
export async function setUserRole(orgId: string, actorId: string, userId: string, role: Role) {
  if (actorId === userId) throw new AppError(409, "CANNOT_CHANGE_OWN_ROLE", "자기 자신의 권한은 바꿀 수 없습니다", "BR-AUTH-03");
  await loadUser(orgId, userId);
  const [user] = await sql`update users set role = ${role} where id = ${userId} and org_id = ${orgId} returning id, role`;
  return user;
}

// BR-AUTH-05: 자기 계정은 중지할 수 없다. 중지하면 기존 세션도 바로 끊긴다 (세션 확인 쿼리가 disabled_at 을 본다)
export async function setUserDisabled(orgId: string, actorId: string, userId: string, disabled: boolean) {
  if (actorId === userId) throw new AppError(409, "CANNOT_DISABLE_SELF", "자기 계정은 중지할 수 없습니다", "BR-AUTH-05");
  await loadUser(orgId, userId);
  const [user] = await sql`
    update users set disabled_at = ${disabled ? sql`now()` : null}
    where id = ${userId} and org_id = ${orgId}
    returning id, disabled_at
  `;
  if (disabled) await sql`update sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null`;
  return user;
}
