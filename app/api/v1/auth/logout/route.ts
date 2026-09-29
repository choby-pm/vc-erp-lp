import { ok } from "@/lib/api/response";
import { destroySession, getCurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/services/audit";

// POST /api/v1/auth/logout — 세션을 만료시키고 쿠키를 지운다
export async function POST(request: Request) {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await writeAudit({ actor_type: "user", user, method: "POST", path: "/api/v1/auth/logout", status: 200, request });
  return ok({ logged_out: true });
}
