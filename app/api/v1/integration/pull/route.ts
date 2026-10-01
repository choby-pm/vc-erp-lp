import { ok } from "@/lib/api/response";
import { withOrgUser } from "@/lib/api/handler";
import { pullAndProcessExclusive } from "@/lib/gp/sync";
import { orgConnectionIds } from "@/lib/services/integration";

// POST /api/v1/integration/pull — 놓친 이벤트 지금 가져오기 + 처리 (관리자, BR-SYNC-08)
// 우리 기관이 연결된 GP만. 주기 작업과 같은 잠금을 써서 겹치면 건너뛴다 (skipped: true)
export const POST = withOrgUser(async (_request, _ctx, user) =>
  ok(await pullAndProcessExclusive(await orgConnectionIds(user.org_id), "manual", { type: "user", user })),
);
