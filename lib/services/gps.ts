import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import type { DataSource, FundStatus, GpType, Strategy } from "@/lib/labels";
import type { GpInput } from "@/lib/schemas/gps";

// 운용사 (R1-2). 기관마다 따로 관리한다 — 같은 이름의 GP를 두 기관이 각자 등록해도 서로 보이지 않는다 (03 4-2)
// 모든 함수는 기관 ID를 첫 인자로 받는다 (BR-ORG-02)

export type GpListItem = {
  id: string;
  name: string;
  gp_type: GpType;
  aum_amount: number | null;
  contact_name: string | null;
  is_linked: boolean;
  fund_count: number;
};

export type GpDetail = GpListItem & {
  contact_email: string | null;
  contact_phone: string | null;
  memo: string | null;
  connection_name: string | null;
  created_at: Date;
  funds: { id: string; name: string; status: FundStatus; strategy: Strategy; data_source: DataSource; vintage_year: number | null }[];
};

export async function listGps(orgId: string, q?: string) {
  return sql<GpListItem[]>`
    select g.id, g.name, g.gp_type, g.aum_amount, g.contact_name,
           g.gp_connection_id is not null as is_linked,
           (select count(*)::int from funds f where f.gp_id = g.id and f.org_id = ${orgId}) as fund_count
    from gps g
    where g.org_id = ${orgId}
      ${q ? sql`and g.name ilike ${"%" + q + "%"}` : sql``}
    order by g.name
  `;
}

export async function getGp(orgId: string, gpId: string): Promise<GpDetail> {
  assertUuid(gpId, "운용사를");
  const [gp] = await sql<Omit<GpDetail, "funds">[]>`
    select g.id, g.name, g.gp_type, g.aum_amount, g.contact_name, g.contact_email, g.contact_phone, g.memo, g.created_at,
           g.gp_connection_id is not null as is_linked, c.name as connection_name,
           (select count(*)::int from funds f where f.gp_id = g.id and f.org_id = ${orgId}) as fund_count
    from gps g
    left join gp_connections c on c.id = g.gp_connection_id
    where g.id = ${gpId} and g.org_id = ${orgId}
  `;
  if (!gp) throw notFound("운용사를");
  const funds = await sql<GpDetail["funds"]>`
    select id, name, status, strategy, data_source, vintage_year
    from funds where gp_id = ${gpId} and org_id = ${orgId}
    order by created_at desc
  `;
  return { ...gp, funds };
}

// BR-GP-01: 기관 안에서 운용사 이름은 하나 (기존 운용사를 함께 알려준다)
async function assertNameFree(orgId: string, name: string, exceptId?: string) {
  const [dup] = await sql<{ id: string }[]>`
    select id from gps where org_id = ${orgId} and lower(name) = lower(${name}) ${exceptId ? sql`and id <> ${exceptId}` : sql``}
  `;
  if (dup) throw new AppError(409, "DUPLICATE_GP", "같은 이름의 운용사가 이미 있습니다", "BR-GP-01", { existing_gp_id: dup.id });
}

export async function createGp(orgId: string, userId: string, input: GpInput) {
  await assertNameFree(orgId, input.name);
  const [gp] = await sql<{ id: string }[]>`
    insert into gps (org_id, name, gp_type, aum_amount, contact_name, contact_email, contact_phone, memo, created_by)
    values (${orgId}, ${input.name}, ${input.gp_type}, ${input.aum_amount}, ${input.contact_name}, ${input.contact_email},
            ${input.contact_phone}, ${input.memo}, ${userId})
    returning id
  `;
  return getGp(orgId, gp.id);
}

export async function updateGp(orgId: string, gpId: string, input: GpInput) {
  await getGp(orgId, gpId);
  await assertNameFree(orgId, input.name, gpId);
  await sql`
    update gps set name = ${input.name}, gp_type = ${input.gp_type}, aum_amount = ${input.aum_amount},
                   contact_name = ${input.contact_name}, contact_email = ${input.contact_email},
                   contact_phone = ${input.contact_phone}, memo = ${input.memo}
    where id = ${gpId} and org_id = ${orgId}
  `;
  return getGp(orgId, gpId);
}
