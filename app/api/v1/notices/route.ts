import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { noticeCreateSchema, noticeListQuerySchema } from "@/lib/schemas/notices";
import { createManualNotice, listNotices } from "@/lib/services/notices";

// GET /api/v1/notices?unacknowledged=true&type=&fund_id= — 통지함 (최근 순)
export const GET = withOrgUser(async (request, _ctx, user) => {
  const parsed = noticeListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "검색 조건을 확인하세요");
  return ok(await listNotices(user.org_id, parsed.data));
});

// POST /api/v1/notices — 수기 통지 기록 { fund_id?, notice_type, title, body, received_date } (BR-NTC-01). 연동 조합은 GP_MANAGED_FIELD
export const POST = withOrgUser(async (request, _ctx, user) => ok(await createManualNotice(user.org_id, await parseBody(request, noticeCreateSchema)), 201));
