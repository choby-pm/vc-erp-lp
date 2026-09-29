import { ok } from "@/lib/api/response";
import { parseBody, withOrgUser } from "@/lib/api/handler";
import { programSchema } from "@/lib/schemas/programs";
import { createProgram, listPrograms } from "@/lib/services/programs";

// GET /api/v1/programs — 출자사업 목록 (부문 수·예정액·접수·선정 현황)
export const GET = withOrgUser(async (_request, _ctx, user) => ok(await listPrograms(user.org_id)));

// POST /api/v1/programs — 출자사업 작성 { budget_id, name, apply_start_date, apply_end_date }
export const POST = withOrgUser(async (request, _ctx, user) => {
  const input = await parseBody(request, programSchema);
  return ok(await createProgram(user.org_id, user.id, input), 201);
});
