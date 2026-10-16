import { withOrgUser } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { requestFundSharing, sharingRequest } from "@/lib/services/sharing";
export const POST = withOrgUser<
  RouteContext<"/api/v1/funds/[fund_id]/sharing/requests">
>(async (r, c, u) => {
  const parsed = sharingRequest.safeParse(await r.json().catch(() => null));
  if (!parsed.success)
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "자료 종류와 공유 요청 사유를 입력하세요",
    );
  return ok(
    await requestFundSharing(u.org_id, (await c.params).fund_id, parsed.data, {
      type: "user",
      user: u,
    }),
    201,
  );
});
