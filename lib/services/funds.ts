import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { FUND_STATUSES, FUND_STATUS_LABEL, type DataSource, type FundStatus, type FundType, type Strategy } from "@/lib/labels";
import { withJosa } from "@/lib/format";
import type { FundCreateInput, FundInput, FundListQuery, FundStatusInput, LinkedFundInput } from "@/lib/schemas/funds";

// 조합 (R1-3, L18). 기관마다 따로 관리한다. 모든 함수는 기관 ID를 첫 인자로 받는다 (BR-ORG-02)
// · 수기 조합: 담당자가 정보·상태를 입력한다
// · 연동 조합(gp_api): GP 값은 동기화만 바꾼다. 사용자가 바꾸려 하면 GP_MANAGED_FIELD (BR-COM-05, R3)
//   단 분야(strategy)는 GP에 없는 LP 쪽 분류라 담당자가 고친다. 동기화는 분야를 건드리지 않는다 (R3-5)

export type FundListItem = {
  id: string;
  name: string;
  gp_id: string;
  gp_name: string;
  fund_type: FundType;
  strategy: Strategy;
  status: FundStatus;
  target_amount: number | null;
  fund_size_amount: number | null;
  vintage_year: number | null;
  data_source: DataSource;
};

export type FundDetail = FundListItem & {
  formation_date: string | null;
  term_years: number | null;
  investment_period_years: number | null;
  maturity_date: string | null;
  management_fee_rate: number | null;
  carry_rate: number | null;
  hurdle_rate: number | null;
  primary_purpose: string | null;
  primary_purpose_min_ratio: number | null;
  last_synced_at: Date | null;
  created_at: Date;
  gp_is_linked: boolean;
};

const ratio = (v: string | null) => (v === null ? null : Number(v));

export async function listFunds(orgId: string, q: FundListQuery = {}) {
  return sql<FundListItem[]>`
    select f.id, f.name, f.gp_id, g.name as gp_name, f.fund_type, f.strategy, f.status,
           f.target_amount, f.fund_size_amount, f.vintage_year, f.data_source
    from funds f join gps g on g.id = f.gp_id
    where f.org_id = ${orgId}
      ${q.status ? sql`and f.status = ${q.status}` : sql``}
      ${q.strategy ? sql`and f.strategy = ${q.strategy}` : sql``}
      ${q.data_source ? sql`and f.data_source = ${q.data_source}` : sql``}
      ${q.gp_id ? sql`and f.gp_id = ${q.gp_id}` : sql``}
    order by array_position(${sql.array([...FUND_STATUSES])}::text[], f.status), f.vintage_year desc nulls first, f.name
  `;
}

export async function getFund(orgId: string, fundId: string): Promise<FundDetail> {
  assertUuid(fundId, "조합을");
  const [f] = await sql`
    select f.id, f.name, f.gp_id, g.name as gp_name, f.fund_type, f.strategy, f.status, f.target_amount, f.fund_size_amount,
           f.vintage_year, f.data_source, f.formation_date, f.term_years, f.investment_period_years,
           case when f.formation_date is not null and f.term_years is not null
                then (f.formation_date + make_interval(years => f.term_years))::date end as maturity_date,
           f.management_fee_rate, f.carry_rate, f.hurdle_rate, f.primary_purpose, f.primary_purpose_min_ratio,
           f.last_synced_at, f.created_at, g.gp_connection_id is not null as gp_is_linked
    from funds f join gps g on g.id = f.gp_id
    where f.id = ${fundId} and f.org_id = ${orgId}
  `;
  if (!f) throw notFound("조합을");
  // numeric 은 문자열로 오므로 숫자로 바꾼다
  return {
    ...f,
    management_fee_rate: ratio(f.management_fee_rate),
    carry_rate: ratio(f.carry_rate),
    hurdle_rate: ratio(f.hurdle_rate),
    primary_purpose_min_ratio: ratio(f.primary_purpose_min_ratio),
  } as FundDetail;
}

// 연동 GP의 조합은 GP에서 받는다. 수기로 만들 수 없다 (BR-FUND-01)
async function loadGpForManualFund(orgId: string, gpId: string) {
  const [gp] = await sql<{ id: string; linked: boolean }[]>`
    select id, gp_connection_id is not null as linked from gps where id = ${gpId} and org_id = ${orgId}
  `;
  if (!gp) throw new AppError(404, "NOT_FOUND", "운용사를 찾을 수 없습니다", undefined, { fields: { gp_id: "운용사를 찾을 수 없습니다" } });
  if (gp.linked) {
    throw new AppError(409, "GP_MANAGED_FIELD", "연동된 운용사의 조합은 GP에서 자동으로 들어옵니다. 직접 만들 수 없습니다", "BR-FUND-01");
  }
}

async function assertNameFree(orgId: string, gpId: string, name: string, exceptId?: string) {
  const [dup] = await sql<{ id: string }[]>`
    select id from funds where org_id = ${orgId} and gp_id = ${gpId} and lower(name) = lower(${name}) ${exceptId ? sql`and id <> ${exceptId}` : sql``}
  `;
  if (dup) throw new AppError(409, "DUPLICATE_FUND", "이 운용사에 같은 이름의 조합이 이미 있습니다", "BR-FUND-01", { existing_fund_id: dup.id });
}

export async function createFund(orgId: string, userId: string, input: FundCreateInput) {
  await loadGpForManualFund(orgId, input.gp_id);
  await assertNameFree(orgId, input.gp_id, input.name);
  const [f] = await sql<{ id: string }[]>`
    insert into funds (org_id, gp_id, name, fund_type, strategy, status, target_amount, term_years, investment_period_years,
                       management_fee_rate, carry_rate, hurdle_rate, primary_purpose, primary_purpose_min_ratio, data_source, created_by)
    values (${orgId}, ${input.gp_id}, ${input.name}, ${input.fund_type}, ${input.strategy}, ${input.status}, ${input.target_amount},
            ${input.term_years}, ${input.investment_period_years}, ${input.management_fee_rate}, ${input.carry_rate}, ${input.hurdle_rate},
            ${input.primary_purpose}, ${input.primary_purpose_min_ratio}, 'manual', ${userId})
    returning id
  `;
  return getFund(orgId, f.id);
}

function assertManual(fund: FundDetail) {
  if (fund.data_source === "gp_api") {
    throw new AppError(409, "GP_MANAGED_FIELD", "GP에서 받은 조합이라 여기서 바꿀 수 없습니다", "BR-COM-05");
  }
}

export async function updateFund(orgId: string, fundId: string, input: FundInput) {
  const fund = await getFund(orgId, fundId);
  assertManual(fund);
  await assertNameFree(orgId, fund.gp_id, input.name, fundId);
  await sql`
    update funds set name = ${input.name}, fund_type = ${input.fund_type}, strategy = ${input.strategy},
      target_amount = ${input.target_amount}, term_years = ${input.term_years}, investment_period_years = ${input.investment_period_years},
      management_fee_rate = ${input.management_fee_rate}, carry_rate = ${input.carry_rate}, hurdle_rate = ${input.hurdle_rate},
      primary_purpose = ${input.primary_purpose}, primary_purpose_min_ratio = ${input.primary_purpose_min_ratio}
    where id = ${fundId} and org_id = ${orgId}
  `;
  return getFund(orgId, fundId);
}

// 연동 조합의 분야 수정 (R3-5). 예산 분야 배분(BR-BUD-05)에 쓰인다
export async function updateLinkedFund(orgId: string, fundId: string, input: LinkedFundInput) {
  const fund = await getFund(orgId, fundId);
  if (fund.data_source !== "gp_api") throw new AppError(409, "INVALID_STATE", "수기 조합은 조합 수정 화면에서 고칩니다");
  await sql`update funds set strategy = ${input.strategy} where id = ${fundId} and org_id = ${orgId}`;
  return getFund(orgId, fundId);
}

const FORMED_OR_LATER: FundStatus[] = ["formed", "operating", "dissolved", "liquidated"];

// BR-FUND-02: 수기 조합 상태는 앞으로만 간다 (단계 건너뛰기 가능). 결성 완료 이후로 처음 갈 때 결성일·결성액 필수
export async function changeFundStatus(orgId: string, fundId: string, input: FundStatusInput) {
  const fund = await getFund(orgId, fundId);
  assertManual(fund);
  const from = FUND_STATUSES.indexOf(fund.status);
  const to = FUND_STATUSES.indexOf(input.status);
  if (to <= from) {
    throw new AppError(409, "INVALID_STATUS_TRANSITION", `${FUND_STATUS_LABEL[fund.status]}에서 ${withJosa(FUND_STATUS_LABEL[input.status], "으로")} 바꿀 수 없습니다. 상태는 앞으로만 바뀝니다`, "BR-FUND-02");
  }

  let formationDate = fund.formation_date;
  let fundSize = fund.fund_size_amount;
  if (FORMED_OR_LATER.includes(input.status) && !fund.formation_date) {
    const fields: Record<string, string> = {};
    if (!input.formation_date) fields.formation_date = "결성일을 입력하세요";
    if (!input.fund_size_amount) fields.fund_size_amount = "결성액을 입력하세요";
    if (Object.keys(fields).length) throw new AppError(400, "VALIDATION_ERROR", "결성 정보를 입력하세요", "BR-FUND-02", { fields });
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    if (input.formation_date! > today) {
      throw new AppError(422, "INVALID_DATE", "결성일은 오늘 이후일 수 없습니다", "BR-FUND-02", { fields: { formation_date: "결성일은 오늘 이후일 수 없습니다" } });
    }
    formationDate = input.formation_date;
    fundSize = input.fund_size_amount;
  }

  await sql`
    update funds set status = ${input.status}, formation_date = ${formationDate}, fund_size_amount = ${fundSize}
    where id = ${fundId} and org_id = ${orgId}
  `;
  return getFund(orgId, fundId);
}
