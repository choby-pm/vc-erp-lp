import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { gpClient, type GpActor } from "@/lib/gp/client";
import type { DataSource } from "@/lib/labels";
import type { NoticeCreateInput, NoticeListQuery } from "@/lib/schemas/notices";

// 통지함 (R5-1, BR-NTC-01·02, BR-SYNC-10·11). 모든 함수는 기관 ID를 첫 인자로 받는다 (BR-ORG-02)
// · 연동 GP의 통지는 GP 값 그대로 들어온다 (출자 제안·캐피탈콜·보고·총회·분배·일반 모두). 수기로도 기록할 수 있다
// · 확인은 우리 쪽 값이다. 출자 담당이 확인하면 저장한 뒤 연동이면 GP에 "확인함"을 보낸다 (GP의 확인 시각은 LP 시스템만 기록, 🔗 GP BR-NTC-02)
// · 보낼 것은 상태로 판단: 확인했는데 gp_ack_sent_at 이 비어 있으면 보낼 것 (BR-SYNC-11). GP는 처음 확인 시각을 유지하므로 두 번 보내도 같다 (BR-SYNC-12)

export type NoticeType = "proposal" | "capital_call" | "report" | "meeting" | "distribution" | "general";
export type NoticeItem = {
  id: string;
  fund_id: string | null;
  fund_name: string | null;
  gp_name: string | null;
  notice_type: NoticeType;
  title: string;
  body: string | null;
  sent_at: Date;
  acknowledged_at: Date | null;
  acknowledged_by_name: string | null;
  gp_ack_sent_at: Date | null;
  data_source: DataSource;
};

const listQuery = (orgId: string) => sql`
  select n.id, n.fund_id, f.name as fund_name, g.name as gp_name, n.notice_type, n.title, n.body, n.sent_at,
         n.acknowledged_at, u.name as acknowledged_by_name, n.gp_ack_sent_at, n.data_source
  from notices n
  left join funds f on f.id = n.fund_id
  left join gps g on g.id = f.gp_id
  left join users u on u.id = n.acknowledged_by
  where n.org_id = ${orgId}
`;

export async function listNotices(orgId: string, q: NoticeListQuery = {}) {
  return sql<NoticeItem[]>`
    ${listQuery(orgId)}
      ${q.unacknowledged ? sql`and n.acknowledged_at is null` : sql``}
      ${q.type ? sql`and n.notice_type = ${q.type}` : sql``}
      ${q.fund_id ? sql`and n.fund_id = ${q.fund_id}` : sql``}
    order by n.sent_at desc
    limit 300
  `;
}

export async function countUnacknowledged(orgId: string) {
  const [r] = await sql<{ n: number }[]>`select count(*)::int as n from notices where org_id = ${orgId} and acknowledged_at is null`;
  return r.n;
}

export async function getNotice(orgId: string, noticeId: string) {
  assertUuid(noticeId, "통지를");
  const [n] = await sql<NoticeItem[]>`${listQuery(orgId)} and n.id = ${noticeId}`;
  if (!n) throw notFound("통지를");
  return n;
}

// 수기 통지 (우편·메일로 받은 것, BR-NTC-01). 조합은 수기 조합만 고를 수 있다 (연동 조합의 통지는 GP에서 들어온다)
export async function createManualNotice(orgId: string, input: NoticeCreateInput) {
  if (input.fund_id) {
    const [f] = await sql<{ data_source: DataSource }[]>`select data_source from funds where id = ${input.fund_id} and org_id = ${orgId}`;
    if (!f) throw new AppError(404, "NOT_FOUND", "조합을 찾을 수 없습니다", undefined, { fields: { fund_id: "조합을 찾을 수 없습니다" } });
    if (f.data_source === "gp_api") throw new AppError(409, "GP_MANAGED_FIELD", "연동 조합의 통지는 GP에서 자동으로 들어옵니다", "BR-NTC-01");
  }
  const [row] = await sql<{ id: string }[]>`
    insert into notices (org_id, fund_id, notice_type, title, body, sent_at, data_source)
    values (${orgId}, ${input.fund_id ?? null}, ${input.notice_type}, ${input.title}, ${input.body},
            (${input.received_date}::date::timestamp + interval '9 hours') at time zone 'Asia/Seoul', 'manual')
    returning id
  `;
  return getNotice(orgId, row.id);
}

// ─── 확인 · GP에 전달 (BR-NTC-02) ────────────────────────────────────────────

export type AckSync = { status: "not_needed" | "sent" | "pending"; message?: string };

type AckTarget = { id: string; org_id: string; gp_notice_id: string | null; gp_id: string | null; data_source: DataSource };

async function sendAck(t: AckTarget, actor?: GpActor): Promise<AckSync> {
  if (t.data_source !== "gp_api" || !t.gp_notice_id || !t.gp_id) return { status: "not_needed" };
  try {
    const gp = await gpClient(t.org_id, t.gp_id, actor);
    await gp.post(`/notices/${t.gp_notice_id}/acknowledge`);
  } catch (err) {
    return { status: "pending", message: err instanceof Error ? err.message : String(err) };
  }
  await sql`update notices set gp_ack_sent_at = now() where id = ${t.id}`;
  return { status: "sent" };
}

// 연동 통지의 GP 운용사: 조합이 있으면 조합의 운용사, 없으면 그 GP 연결의 운용사 (조합원 되기 전 통지)
const ackTargets = (where: ReturnType<typeof sql>) => sql<AckTarget[]>`
  select n.id, n.org_id, n.gp_notice_id, n.data_source,
         coalesce(f.gp_id, (select l.gp_id from gp_lp_links l where l.org_id = n.org_id limit 1)) as gp_id
  from notices n left join funds f on f.id = n.fund_id
  where ${where}
`;

export async function acknowledgeNotice(orgId: string, userId: string, noticeId: string, actor?: GpActor) {
  assertUuid(noticeId, "통지를");
  const [row] = await sql<{ id: string }[]>`
    update notices set acknowledged_at = coalesce(acknowledged_at, now()), acknowledged_by = coalesce(acknowledged_by, ${userId})
    where id = ${noticeId} and org_id = ${orgId}
    returning id
  `;
  if (!row) throw notFound("통지를");
  const [t] = await ackTargets(sql`n.id = ${noticeId} and n.gp_ack_sent_at is null`);
  const gp_sync = t ? await sendAck(t, actor) : ({ status: "sent" } as AckSync); // 이미 보냈으면 그대로
  return { ...(await getNotice(orgId, noticeId)), gp_sync };
}

// 못 보낸 확인 보내기 — 주기 작업(전체)·관리자 "못 보낸 것 지금 보내기"(우리 기관) (BR-SYNC-11)
export async function sendPendingAcks(orgId: string | null, actor?: GpActor) {
  const targets = await ackTargets(sql`
    n.data_source = 'gp_api' and n.acknowledged_at is not null and n.gp_ack_sent_at is null
    and (${orgId}::uuid is null or n.org_id = ${orgId}::uuid)
  `);
  const result = { sent: 0, pending: 0 };
  for (const t of targets) result[(await sendAck(t, actor)).status === "sent" ? "sent" : "pending"]++;
  return result;
}

export async function listUnsentAcks(orgId: string) {
  return sql<{ id: string; title: string; acknowledged_at: Date }[]>`
    select id, title, acknowledged_at from notices
    where org_id = ${orgId} and data_source = 'gp_api' and acknowledged_at is not null and gp_ack_sent_at is null
    order by acknowledged_at desc
  `;
}

// ─── 연동 통지 받기 (동기화에서 부른다, BR-NTC-01) ───────────────────────────

type GpNotice = { id: string; fund_id: string; notice_type: NoticeType; title: string; body: string | null; sent_at: string };

// GP 통지 목록을 다시 읽어 만들기·갱신. 확인 여부는 우리 값이라 건드리지 않는다
// 조합은 우리 기관에 있는 연동 조합으로 이어 준다 (아직 없으면 비워 두고, 다음 맞추기 때 이어진다)
export async function syncNotices(orgId: string, gpId: string, actor?: GpActor) {
  const gp = await gpClient(orgId, gpId, actor);
  const list = await gp.get<GpNotice[]>("/notices");
  let created = 0;
  for (const n of list) {
    const [row] = await sql<{ inserted: boolean }[]>`
      insert into notices (org_id, fund_id, notice_type, title, body, sent_at, data_source, gp_notice_id)
      values (${orgId}, (select id from funds where org_id = ${orgId} and gp_fund_id = ${n.fund_id}), ${n.notice_type}, ${n.title}, ${n.body},
              ${n.sent_at}, 'gp_api', ${n.id})
      on conflict (org_id, gp_notice_id) do update
        set title = excluded.title, body = excluded.body, sent_at = excluded.sent_at, fund_id = coalesce(excluded.fund_id, notices.fund_id)
      returning (xmax = 0) as inserted
    `;
    if (row.inserted) created++;
  }
  return { fetched: list.length, created };
}
