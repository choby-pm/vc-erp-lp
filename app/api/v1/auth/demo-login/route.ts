import { z } from "zod";
import { sql } from "@/lib/db";
import { fail, ok, readJson } from "@/lib/api/response";
import { DEMO_ORGS, DEMO_ROLES, demoEmail } from "@/lib/auth/demo";
import { createSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/services/audit";

const schema = z.object({
  org: z.enum(Object.keys(DEMO_ORGS) as [keyof typeof DEMO_ORGS]),
  role: z.enum(DEMO_ROLES),
});

// POST /api/v1/auth/demo-login — 비밀번호 없이 데모 계정으로 로그인 (05 API 설계 3-1)
// { "org": "a" | "b", "role": "officer" | "approver" | "admin" }
export async function POST(request: Request) {
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "데모 기관과 역할을 고르세요");
  }
  const { org, role } = parsed.data;

  // 이메일과 기관 ID를 함께 확인한다 (데모 계정이 다른 기관으로 옮겨져 있으면 들어가지 않는다)
  const [user] = await sql<{ id: string; email: string; name: string; role: string; org_id: string }[]>`
    select id, email, name, role, org_id from users
    where email = ${demoEmail(org, role)} and org_id = ${DEMO_ORGS[org].id} and disabled_at is null
  `;
  if (!user) {
    return fail(404, "NOT_FOUND", "데모 계정이 아직 준비되지 않았습니다 (npm run db:seed)");
  }

  await createSession(user.id);
  await writeAudit({ actor_type: "user", user, method: "POST", path: "/api/v1/auth/demo-login", status: 200, detail: { demo: `${org}/${role}` }, request });
  return ok({ id: user.id, email: user.email, name: user.name });
}
