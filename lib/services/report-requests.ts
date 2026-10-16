import { z } from "zod";
import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { gpClient, type GpActor } from "@/lib/gp/client";
import { upsertGpReports } from "@/lib/services/reports";
export const requestInput = z
  .object({
    as_of: z.iso
      .date()
      .regex(/-(03-31|06-30|09-30|12-31)$/, "분기 종료일을 선택하세요"),
    due_date: z.iso.date(),
    reason: z.string().trim().min(1).max(2000),
  })
  .refine((v) => v.due_date >= v.as_of, {
    message: "회신기한은 보고 기준일 이후여야 합니다",
  });
const remoteRequest = z.object({
  id: z.uuid(),
  client_id: z.uuid(),
  as_of: z.iso.date(),
  due_date: z.iso.date(),
  reason: z.string(),
  requester: z.string(),
  status: z.enum([
    "requested",
    "acknowledged",
    "replied",
    "received",
    "unavailable",
    "cancelled",
  ]),
  created_at: z.string(),
  acknowledged_at: z.string().nullable(),
  overdue: z.boolean(),
});
const remoteReply = z.object({
  id: z.uuid(),
  request_id: z.uuid(),
  version: z.number().int().positive(),
  report_id: z.uuid(),
  reason: z.string(),
  replied_at: z.string(),
  received_at: z.string().nullable(),
});
const remoteHistory = z.object({
  request_id: z.uuid(),
  action: z.string(),
  reason: z.string(),
  actor: z.string(),
  occurred_at: z.string(),
});
const response = z.object({
  requests: z.array(remoteRequest),
  replies: z.array(remoteReply),
  history: z.array(remoteHistory),
});
export type RequestSnapshot = z.infer<typeof remoteRequest> & {
  replies: z.infer<typeof remoteReply>[];
  history: z.infer<typeof remoteHistory>[];
};
export type LocalRequest = {
  id: string;
  gp_request_id: string | null;
  as_of: string;
  due_date: string;
  reason: string;
  requester: string;
  delivery_status: "pending" | "sent" | "rejected";
  attempts: number;
  last_error: string | null;
  last_attempt_at: Date | null;
  next_retry_at: Date | null;
  checked_at: Date | null;
  created_at: Date;
  snapshot: RequestSnapshot | null;
};
async function target(orgId: string, fundId: string, actor?: GpActor) {
  assertUuid(fundId, "조합을");
  const [f] = await sql<
    { gp_id: string; gp_fund_id: string | null; data_source: string }[]
  >`select gp_id,gp_fund_id,data_source from funds where id=${fundId} and org_id=${orgId}`;
  if (!f) throw notFound("조합을");
  if (f.data_source !== "gp_api" || !f.gp_fund_id)
    throw new AppError(
      409,
      "NOT_LINKED",
      "자료 요청은 연동 조합에서 사용할 수 있습니다",
    );
  return {
    gp: await gpClient(orgId, f.gp_id, actor),
    path: `/funds/${f.gp_fund_id}/report-requests`,
    fund: f,
  };
}
export async function listLocalRequests(orgId: string, fundId: string) {
  await target(orgId, fundId);
  const requests = await sql<
    LocalRequest[]
  >`select id,gp_request_id,as_of::text,due_date::text,reason,requester,delivery_status,attempts,last_error,last_attempt_at,next_retry_at,checked_at,created_at,snapshot from report_requests where org_id=${orgId} and fund_id=${fundId} order by created_at desc`;
  const receipts = await sql<
    {
      request_id: string;
      gp_reply_id: string;
      report_id: string;
      version: number;
      received_at: Date;
      gp_ack_at: Date | null;
    }[]
  >`select c.request_id,c.gp_reply_id,c.report_id,c.version,c.received_at,c.gp_ack_at from report_request_receipts c join report_requests r on r.org_id=c.org_id and r.id=c.request_id where c.org_id=${orgId} and r.fund_id=${fundId} order by c.version`;
  return { requests, receipts };
}
export async function deliverReportRequest(
  orgId: string,
  fundId: string,
  id: string,
  actor?: GpActor,
) {
  assertUuid(id, "자료 요청을");
  const { gp, path } = await target(orgId, fundId, actor);
  const [r] = await sql<
    LocalRequest[]
  >`select *,as_of::text,due_date::text from report_requests where id=${id} and org_id=${orgId} and fund_id=${fundId}`;
  if (!r) throw notFound("자료 요청을");
  if (r.gp_request_id) return { status: "sent" };
  try {
    const result = z.object({ id: z.uuid() }).parse(
      await gp.post(path, {
        client_id: r.id,
        as_of: r.as_of,
        due_date: r.due_date,
        reason: r.reason,
        requester: r.requester,
      }),
    );
    await sql`update report_requests set gp_request_id=${result.id},delivery_status='sent',attempts=attempts+1,last_attempt_at=clock_timestamp(),next_retry_at=null,last_error=null where id=${id} and org_id=${orgId}`;
    return { status: "sent" };
  } catch (e) {
    const rejected =
        e instanceof AppError &&
        ["GP_REJECTED", "SHARING_NOT_ALLOWED"].includes(e.code),
      message = e instanceof Error ? e.message : String(e);
    await sql`update report_requests set delivery_status=${rejected ? "rejected" : "pending"},attempts=attempts+1,last_attempt_at=clock_timestamp(),next_retry_at=${rejected || r.attempts >= 4 ? null : new Date(Date.now() + [60000, 300000, 1800000, 7200000][Math.min(r.attempts, 3)])},last_error=${message} where id=${id} and org_id=${orgId}`;
    return { status: rejected ? "rejected" : "pending", message };
  }
}
export async function createLocalRequest(
  orgId: string,
  fundId: string,
  input: z.infer<typeof requestInput>,
  user: { id: string; name: string; role: string; org_id: string },
) {
  await target(orgId, fundId, { type: "user", user });
  const r = await sql.begin(async (tx) => {
    await tx`select id from funds where id=${fundId} and org_id=${orgId} for update`;
    const [pending] =
      await tx`select id from report_requests where org_id=${orgId} and fund_id=${fundId} and as_of=${input.as_of} and (gp_request_id is null and delivery_status='pending' or gp_request_id is not null and snapshot is null or snapshot->>'status' in ('requested','acknowledged','replied'))`;
    if (pending)
      throw new AppError(
        409,
        "REQUEST_PENDING",
        "같은 조합·기준일의 요청이 진행 중입니다",
      );
    const [r] = await tx<
      { id: string }[]
    >`insert into report_requests(org_id,fund_id,as_of,due_date,reason,requester,requested_by) values(${orgId},${fundId},${input.as_of},${input.due_date},${input.reason},${user.name},${user.id}) returning id`;
    return r;
  });
  const delivery = await deliverReportRequest(orgId, fundId, r.id, {
    type: "user",
    user,
  });
  return { id: r.id, delivery };
}
export async function syncReportRequests(
  orgId: string,
  fundId: string,
  actor?: GpActor,
) {
  const { gp, path, fund } = await target(orgId, fundId, actor);
  const pending = await sql<
    { id: string }[]
  >`select id from report_requests where org_id=${orgId} and fund_id=${fundId} and gp_request_id is null and delivery_status='pending' and attempts<5 and (next_retry_at is null or next_retry_at<=now())`;
  for (const p of pending)
    await deliverReportRequest(orgId, fundId, p.id, actor);
  const parsed = response.safeParse(await gp.get(path));
  if (!parsed.success)
    throw new AppError(
      503,
      "GP_UNAVAILABLE",
      "자료 요청 응답이 올바르지 않습니다",
    );
  const store = async (data: z.infer<typeof response>) => {
    for (const r of data.requests) {
      const snapshot = {
        ...r,
        replies: data.replies.filter((p) => p.request_id === r.id),
        history: data.history.filter((h) => h.request_id === r.id),
      };
      await sql`insert into report_requests(id,org_id,fund_id,gp_request_id,as_of,due_date,reason,requester,delivery_status,snapshot,checked_at) values(${r.client_id},${orgId},${fundId},${r.id},${r.as_of},${r.due_date},${r.reason},${r.requester},'sent',${sql.json(snapshot)},clock_timestamp()) on conflict(org_id,id) do update set gp_request_id=excluded.gp_request_id,delivery_status='sent',last_error=null,next_retry_at=null,snapshot=excluded.snapshot,checked_at=excluded.checked_at where report_requests.fund_id=excluded.fund_id`;
    }
  };
  await store(parsed.data);
  let acknowledged = 0;
  for (const r of parsed.data.requests) {
    if (r.status !== "replied") continue;
    const reply = parsed.data.replies
      .filter((p) => p.request_id === r.id)
      .sort((a, b) => b.version - a.version)[0];
    if (!reply) continue;
    // 보고를 로컬에 저장한 뒤 수신 확인한다. 응답 유실 시 같은 회신 ID로 재확인한다.
    try {
      const reports = await gp.get<Parameters<typeof upsertGpReports>[2]>(
        `/funds/${fund.gp_fund_id}/reports`,
      );
      const report = reports.find((p) => p.id === reply.report_id);
      if (!report)
        throw new AppError(
          409,
          "MISSING_REPORT",
          "회신 보고를 GP에서 찾지 못했습니다",
        );
      await upsertGpReports(orgId, fundId, reports);
      const [local] = await sql<
        { id: string }[]
      >`select id from reports where org_id=${orgId} and fund_id=${fundId} and gp_report_id=${reply.report_id}`;
      if (!local)
        throw new AppError(
          409,
          "MISSING_REPORT",
          "회신 보고 저장을 확인하지 못했습니다",
        );
      await sql`insert into report_request_receipts(org_id,request_id,gp_reply_id,version,report_id) values(${orgId},${r.client_id},${reply.id},${reply.version},${local.id}) on conflict(org_id,gp_reply_id) do nothing`;
      await gp.post(`${path}/${r.id}/receipt`, { reply_id: reply.id });
      await sql`update report_request_receipts set gp_ack_at=coalesce(gp_ack_at,clock_timestamp()) where org_id=${orgId} and gp_reply_id=${reply.id}`;
      acknowledged++;
    } catch (e) {
      await sql`update report_requests set last_error=${e instanceof Error ? e.message : String(e)} where org_id=${orgId} and id=${r.client_id}`;
      if (e instanceof AppError && e.code === "SHARING_NOT_ALLOWED") continue;
      throw e;
    }
  }
  if (acknowledged) await store(response.parse(await gp.get(path)));
  return { checked_at: new Date().toISOString(), acknowledged };
}
export async function cancelLocalRequest(
  orgId: string,
  fundId: string,
  id: string,
  reason: string,
  actor: GpActor,
) {
  assertUuid(id, "자료 요청을");
  const { gp, path } = await target(orgId, fundId, actor);
  const delivery = await deliverReportRequest(orgId, fundId, id, actor);
  if (delivery.status !== "sent")
    throw new AppError(
      409,
      "DELIVERY_PENDING",
      "GP 접수 상태를 확인한 뒤 취소하세요",
    );
  const [r] = await sql<
    { gp_request_id: string }[]
  >`select gp_request_id from report_requests where org_id=${orgId} and fund_id=${fundId} and id=${id}`;
  if (!r) throw notFound("자료 요청을");
  await gp.post(`${path}/${r.gp_request_id}/cancel`, { reason });
  await syncReportRequests(orgId, fundId, actor);
  return { id };
}

export async function retryPendingReportRequests(actor: GpActor) {
  const funds = await sql<
    { org_id: string; fund_id: string }[]
  >`select distinct org_id,fund_id from report_requests where (delivery_status='pending' and attempts<5 and (next_retry_at is null or next_retry_at<=now())) or snapshot->>'status'='replied'`;
  const result = { synced: 0, failed: 0 };
  for (const f of funds) {
    try {
      await syncReportRequests(f.org_id, f.fund_id, actor);
      result.synced++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
