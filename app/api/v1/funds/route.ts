import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { fundCreateSchema, fundListQuerySchema } from "@/lib/schemas/funds";
import { createFund, listFunds } from "@/lib/services/funds";

// GET /api/v1/funds?status=&strategy=&data_source=&gp_id= — 우리 기관 조합 목록
export const GET = withOrgUser(async (request, _ctx, user) => {
  const parsed = fundListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "검색 조건을 확인하세요");
  return ok(await listFunds(user.org_id, parsed.data));
});

// POST /api/v1/funds — 수기 조합 등록 (L18, BR-FUND-01). 연동 GP의 조합은 GP에서 들어온다
export const POST = withOrgUser(async (request, _ctx, user) => {
  const input = await parseBody(request, fundCreateSchema);
  return ok(await createFund(user.org_id, user.id, input), 201);
});
