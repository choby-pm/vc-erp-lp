import { rejectUnlessCron } from "@/lib/api/cron";
import { toErrorResponse } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { resetDemo } from "@/lib/services/demo";

// GET /api/cron/reset-demo — 데모 DB를 매일 원래 데모 데이터로 되돌린다 (L23, 일정은 vercel.ts)
// DB 자체가 바뀌므로 감사 로그도 함께 초기화된다 (남길 곳이 없어 기록하지 않는다)
export async function GET(request: Request) {
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;
  try {
    return ok(await resetDemo());
  } catch (err) {
    return toErrorResponse(err);
  }
}
