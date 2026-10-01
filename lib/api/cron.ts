import { timingSafeEqual } from "node:crypto";
import { fail } from "@/lib/api/response";

// Vercel Cron 인증 (🔗 GP D41, BR-SYNC-08). Vercel 은 CRON_SECRET 이 설정되어 있으면 Authorization: Bearer {CRON_SECRET} 을 붙여 부른다.
// 그 밖의 호출은 거부한다. 통과하면 null, 아니면 실패 응답
export function rejectUnlessCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail(503, "CRON_DISABLED", "CRON_SECRET 이 설정되지 않았습니다");
  const header = request.headers.get("authorization");
  const given = Buffer.from(header ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!header || given.length !== want.length || !timingSafeEqual(given, want)) return fail(401, "UNAUTHORIZED", "주기 작업 인증 값이 올바르지 않습니다");
  return null;
}
