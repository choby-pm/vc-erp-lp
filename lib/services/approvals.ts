import type postgres from "postgres";
import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import type { ApprovalListQuery } from "@/lib/schemas/approvals";
import { applySelectionApproval } from "./selection";

// 결재 (R2-4, L4, BR-APR-01~08). 대상: 선정(selection) · 납입(payment, R4) · 투표(vote, R5)
// 모든 함수는 기관 ID를 첫 인자로 받는다 (BR-ORG-02)

import type { ApprovalStatus, ApprovalTarget } from "@/lib/labels";

export type ApprovalItem = {
  id: string;
  target_type: ApprovalTarget;
  target_id: string;
  status: ApprovalStatus;
  requested_by: string;
  requested_by_name: string;
  requested_at: Date;
  request_comment: string | null;
  approver_name: string | null;
  decided_at: Date | null;
  decision_comment: string | null;
  snapshot: Record<string, unknown>;
  title: string;
};

const listSql = (orgId: string) => sql`
  select a.id, a.target_type, a.target_id, a.status, a.requested_by, r.name as requested_by_name, a.requested_at, a.request_comment,
         d.name as approver_name, a.decided_at, a.decision_comment, a.snapshot,
         case a.target_type when 'selection' then coalesce(f.name, '') else '' end as title
  from approvals a
  join users r on r.id = a.requested_by
  left join users d on d.id = a.approver_id
  left join proposals p on a.target_type = 'selection' and p.id = a.target_id
  left join funds f on f.id = p.fund_id
  where a.org_id = ${orgId}
`;

// 결재함: 내가 결재할 것(내가 올리지 않은 것) / 내가 올린 것 / 전체
export async function listApprovals(orgId: string, userId: string, q: ApprovalListQuery) {
  return sql<ApprovalItem[]>`
    ${listSql(orgId)}
      ${q.box === "to_me" ? sql`and a.requested_by <> ${userId}` : q.box === "mine" ? sql`and a.requested_by = ${userId}` : sql``}
      ${q.status === "all" ? sql`` : sql`and a.status = ${q.status}`}
    order by a.status = 'pending' desc, a.requested_at desc
    limit 200
  `;
}

export async function countPendingForMe(orgId: string, userId: string) {
  const [r] = await sql<{ n: number }[]>`select count(*)::int as n from approvals where org_id = ${orgId} and status = 'pending' and requested_by <> ${userId}`;
  return r.n;
}

export async function getApproval(orgId: string, approvalId: string) {
  assertUuid(approvalId, "결재를");
  const [a] = await sql<ApprovalItem[]>`${listSql(orgId)} and a.id = ${approvalId}`;
  if (!a) throw notFound("결재를");
  return a;
}

export async function approvalsForTarget(orgId: string, targetType: ApprovalTarget, targetId: string) {
  return sql<ApprovalItem[]>`${listSql(orgId)} and a.target_type = ${targetType} and a.target_id = ${targetId} order by a.requested_at desc`;
}

// 결재 대기인지 확인하고 잠근다. 본인 결재 금지 (BR-APR-05), 한 번 결정하면 끝 (BR-APR-07)
async function lockPending(tx: postgres.TransactionSql, orgId: string, approverId: string, approvalId: string) {
  assertUuid(approvalId, "결재를");
  const [a] = await tx<{ status: ApprovalStatus; requested_by: string; target_type: ApprovalTarget; target_id: string }[]>`
    select status, requested_by, target_type, target_id from approvals where id = ${approvalId} and org_id = ${orgId} for update
  `;
  if (!a) throw notFound("결재를");
  if (a.status !== "pending") throw new AppError(409, "APPROVAL_DECIDED", "이미 결정된 결재입니다", "BR-APR-07");
  if (a.requested_by === approverId) throw new AppError(403, "SELF_APPROVAL", "본인이 올린 결재는 결재할 수 없습니다", "BR-APR-05");
  return a;
}

export async function approve(orgId: string, approverId: string, approvalId: string, comment: string | null) {
  const result = await sql.begin(async (tx) => {
    const a = await lockPending(tx, orgId, approverId, approvalId);
    let effect: Record<string, unknown> = {};
    if (a.target_type === "selection") effect = await applySelectionApproval(tx, orgId, approverId, a.target_id);
    else throw new AppError(422, "NOT_IMPLEMENTED", "이 결재 대상은 아직 지원하지 않습니다");
    await tx`
      update approvals set status = 'approved', approver_id = ${approverId}, decided_at = now(), decision_comment = ${comment}
      where id = ${approvalId}
    `;
    return effect;
  });
  return { approval: await getApproval(orgId, approvalId), ...result };
}

// 반려: 사유 필수 (BR-APR-06). 대상은 그대로 — 고쳐서 다시 기안한다 (BR-SEL-04)
export async function reject(orgId: string, approverId: string, approvalId: string, comment: string | null) {
  if (!comment?.trim()) throw new AppError(400, "COMMENT_REQUIRED", "반려 사유를 입력하세요", "BR-APR-06", { fields: { decision_comment: "반려 사유를 입력하세요" } });
  await sql.begin(async (tx) => {
    await lockPending(tx, orgId, approverId, approvalId);
    await tx`
      update approvals set status = 'rejected', approver_id = ${approverId}, decided_at = now(), decision_comment = ${comment}
      where id = ${approvalId}
    `;
  });
  return { approval: await getApproval(orgId, approvalId) };
}
