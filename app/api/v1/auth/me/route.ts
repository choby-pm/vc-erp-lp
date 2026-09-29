import { fail, ok } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";

// GET /api/v1/auth/me — 현재 로그인한 사용자 + 기관 + 역할
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail(401, "UNAUTHORIZED", "로그인이 필요합니다");
  return ok(user);
}
