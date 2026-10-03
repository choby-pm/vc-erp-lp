import { assertUuid, notFound } from "@/lib/api/errors";
import { withOrgUser } from "@/lib/api/handler";
import { sql } from "@/lib/db";
import { gpClient } from "@/lib/gp/client";

// GET /api/v1/reports/{report_id}/attachments/{attachment_id} — 보고서 PDF 내려받기 (03 4-10, L36)
// 연동 GP 파일은 복사해 두지 않고 볼 때 GP에서 받아 그대로 흘려보낸다 (GP 원본이 바뀌어도 늘 GP 것)
export const GET = withOrgUser<RouteContext<"/api/v1/reports/[report_id]/attachments/[attachment_id]">>(async (_request, ctx, user) => {
  const { report_id, attachment_id } = await ctx.params;
  assertUuid(report_id, "보고를");
  assertUuid(attachment_id, "파일을");
  const [a] = await sql<{ file_name: string; content_type: string; gp_attachment_id: string | null; gp_fund_id: string | null; gp_id: string }[]>`
    select a.file_name, a.content_type, a.gp_attachment_id, f.gp_fund_id, f.gp_id
    from attachments a join reports r on r.id = a.target_id join funds f on f.id = r.fund_id
    where a.id = ${attachment_id} and a.target_id = ${report_id} and a.target_type = 'report' and a.org_id = ${user.org_id} and a.deleted_at is null
  `;
  if (!a || !a.gp_attachment_id || !a.gp_fund_id) throw notFound("파일을");
  const gp = await gpClient(user.org_id, a.gp_id, { type: "user", user });
  const res = await gp.download(`/funds/${a.gp_fund_id}/attachments/${a.gp_attachment_id}`);
  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? a.content_type,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.file_name)}`,
      "Cache-Control": "private, no-store",
    },
  });
});
