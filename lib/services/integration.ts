import { sql } from "@/lib/db";
import { syncJobStatus } from "@/lib/gp/inbox";

// GP 연동 관리 화면 (관리자, 05 API 설계 3-13)
// · 우리 기관의 연결만 보여준다. GP 출자자 ID는 앞 8자리만 (전체 값이 화면에 돌아다닐 이유가 없다)
// · 받은 이벤트는 "우리 기관 것"만: 우리 출자자 이벤트 + 우리 기관이 가진 연동 조합의 조합 전체 이벤트 (BR-SYNC-06)
//   다른 기관의 출자자 이벤트나 우리와 관계없는 조합 이벤트는 같은 인박스에 있어도 보이지 않는다

export type InboundStatus = "received" | "processed" | "failed" | "ignored";

export type IntegrationLink = {
  gp_connection_id: string;
  connection_name: string;
  gp_id: string;
  gp_name: string;
  gp_lp_id_prefix: string;
  base_url_env: string;
  env_configured: boolean; // 주소·키·서명 비밀 값 환경 변수가 모두 있는지
  webhook_path: string; // GP 쪽 LP_SYSTEM_WEBHOOK_URL 에 넣을 주소의 뒷부분
  last_pulled_at: Date | null;
  linked_at: Date;
};

export type InboundEvent = {
  id: string;
  gp_event_id: string;
  event_type: string;
  scope: "lp" | "fund"; // 우리 출자자 이벤트 / 조합 전체 이벤트
  fund_name: string | null;
  occurred_at: Date;
  received_via: "webhook" | "pull";
  status: InboundStatus;
  attempts: number;
  last_error: string | null;
  received_at: Date;
  processed_at: Date | null;
};

// 우리 기관 관련 이벤트 조건 (e = inbound_events)
const ourEvents = (orgId: string) => sql`
  exists (
    select 1 from gp_lp_links l
    where l.org_id = ${orgId} and l.gp_connection_id = e.gp_connection_id
      and (e.gp_lp_id = l.gp_lp_id
           or (e.gp_lp_id is null and exists (select 1 from funds f where f.org_id = ${orgId} and f.gp_fund_id = e.gp_fund_id)))
  )
`;

export async function integrationOverview(orgId: string) {
  const rows = await sql<(Omit<IntegrationLink, "env_configured" | "webhook_path"> & { api_key_env: string; webhook_secret_env: string })[]>`
    select l.gp_connection_id, c.name as connection_name, g.id as gp_id, g.name as gp_name, left(l.gp_lp_id::text, 8) as gp_lp_id_prefix,
           c.base_url_env, c.api_key_env, c.webhook_secret_env, c.last_pulled_at, l.created_at as linked_at
    from gp_lp_links l
    join gp_connections c on c.id = l.gp_connection_id
    join gps g on g.org_id = l.org_id and g.id = l.gp_id
    where l.org_id = ${orgId}
    order by c.name
  `;
  const links: IntegrationLink[] = rows.map(({ api_key_env, webhook_secret_env, ...r }) => ({
    ...r,
    env_configured: [r.base_url_env, api_key_env, webhook_secret_env].every((name) => Boolean(process.env[name])),
    webhook_path: `/api/webhooks/gp/${r.gp_connection_id}`,
  }));

  const [counts] = await sql<Record<InboundStatus, number>[]>`
    select count(*) filter (where status = 'received')::int as received,
           count(*) filter (where status = 'processed')::int as processed,
           count(*) filter (where status = 'failed')::int as failed,
           count(*) filter (where status = 'ignored')::int as ignored
    from inbound_events e
    where ${ourEvents(orgId)}
  `;
  return { links, counts, job: await syncJobStatus() };
}

export async function listInboundEvents(orgId: string, status?: InboundStatus | null, limit = 100) {
  return sql<InboundEvent[]>`
    select e.id, e.gp_event_id, e.event_type, case when e.gp_lp_id is null then 'fund' else 'lp' end as scope,
           f.name as fund_name, e.occurred_at, e.received_via, e.status, e.attempts, e.last_error, e.received_at, e.processed_at
    from inbound_events e
    left join funds f on f.org_id = ${orgId} and f.gp_fund_id = e.gp_fund_id
    where ${ourEvents(orgId)}
      and (${status ?? null}::text is null or e.status = ${status ?? null})
    order by e.occurred_at desc, e.gp_event_id desc
    limit ${limit}
  `;
}

// 우리 기관이 연결된 GP 연결들 ("지금 가져오기" 대상)
export async function orgConnectionIds(orgId: string) {
  return (await sql<{ gp_connection_id: string }[]>`select gp_connection_id from gp_lp_links where org_id = ${orgId}`).map((r) => r.gp_connection_id);
}
