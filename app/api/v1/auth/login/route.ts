import { sql } from "@/lib/db";
import { fail, ok, readJson } from "@/lib/api/response";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/services/audit";

const PATH = "/api/v1/auth/login";

type LoginUser = { id: string; email: string; name: string; role: string; org_id: string; password_hash: string; disabled_at: Date | null };

// POST /api/v1/auth/login — 이메일·비밀번호 로그인 (05 API 설계 3-1)
export async function POST(request: Request) {
  const body = await readJson<{ email?: unknown; password?: unknown }>(request);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return fail(400, "VALIDATION_ERROR", "이메일과 비밀번호를 입력하세요");
  }

  const [user] = await sql<LoginUser[]>`
    select id, email, name, role, org_id, password_hash, disabled_at from users where email = ${email}
  `;
  // 감사 로그: 실패도 남긴다. 시도한 이메일만 적고 비밀번호는 남기지 않는다
  const audit = (status: number, error_code: string | null, who: LoginUser | null) =>
    writeAudit({ actor_type: "user", user: who, method: "POST", path: PATH, status, error_code, detail: { email }, request });

  // 이메일이 없는 경우와 비밀번호가 틀린 경우를 같은 문구로 답해, 가입된 이메일을 알아낼 수 없게 한다
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await audit(401, "UNAUTHORIZED", null);
    return fail(401, "UNAUTHORIZED", "이메일 또는 비밀번호가 올바르지 않습니다");
  }
  // 중지된 계정은 비밀번호가 맞을 때만 알려준다
  if (user.disabled_at) {
    await audit(403, "ACCOUNT_DISABLED", user);
    return fail(403, "ACCOUNT_DISABLED", "사용이 중지된 계정입니다. 관리자에게 문의하세요");
  }

  await createSession(user.id);
  await audit(200, null, user);
  return ok({ id: user.id, email: user.email, name: user.name });
}
