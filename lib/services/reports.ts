import type postgres from "postgres";
import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import type { DataSource } from "@/lib/labels";
import type { ComplianceCheckInput, ReportCreateInput, ReportListQuery } from "@/lib/schemas/reports";

// GP 보고 · 검토 · 조건 준수 점검 (R5-2, BR-RPT-01~05, BR-CHK-01, L34~L36). 모든 함수는 기관 ID를 첫 인자로 받는다 (BR-ORG-02)
// · 연동 보고: GP가 발행한 보고만 들어온다. 스냅샷·우리 몫 평가액은 GP 값 (BR-RPT-01, L8)
// · 수기 보고: 기간·받은 날·우리 몫 평가액·주목적 투자 비율 입력. 같은 기간이면 정정 보고로만 (BR-RPT-02)
// · 정정 보고가 들어오면 같은 기간의 이전 보고에 superseded_at (BR-RPT-05). 성과·점검·기한 판정은 대체되지 않은 보고만
// · 조건 준수 점검: 필요 비율 = 조합의 주목적 의무 비율, 실제 비율 = 보고 숫자. 연동은 받을 때 자동 기록 (L34)
//   투자 기간 중 보고의 미달은 "참고"로만 보인다 — 저장은 pass/fail 그대로, 판정 표시는 보고 기준일과 투자 기간 끝으로 계산

type Db = typeof sql;
export type PeriodType = "monthly" | "quarterly" | "semiannual" | "annual";
export type CheckView = "pass" | "fail" | "reference"; // reference = 투자 기간 중 미달 (참고, L34)

export type ReportItem = {
  id: string;
  fund_id: string;
  fund_name: string;
  gp_name: string;
  period_type: PeriodType;
  period_start: string;
  period_end: string;
  is_correction: boolean;
  superseded_at: Date | null;
  received_date: string | null;
  nav_amount: number | null;
  data_source: DataSource;
  reviewed_at: Date | null;
  reviewed_by_name: string | null;
  investment_period_end: string | null; // 투자 기간 끝 날짜 (점검 판정용)
  check_result: "pass" | "fail" | null; // 가장 최근 점검
  check_view: CheckView | null;
};
export type ReportDetail = ReportItem & {
  gp_comment: string | null;
  snapshot: Record<string, unknown> | null;
  attachments: { id: string; file_name: string; size_bytes: number | null }[];
  checks: { id: string; required_ratio: number | null; actual_ratio: number | null; result: "pass" | "fail"; view: CheckView; memo: string | null; created_by_name: string | null; created_at: Date }[];
  primary_purpose_min_ratio: number | null;
};

// 투자 기간 중 미달은 참고 (L34)
export const checkView = (result: "pass" | "fail", periodEnd: string, investmentEnd: string | null): CheckView =>
  result === "pass" ? "pass" : investmentEnd && periodEnd < investmentEnd ? "reference" : "fail";

const listQuery = (db: Db, orgId: string) => db`
  select r.id, r.fund_id, f.name as fund_name, g.name as gp_name, r.period_type, r.period_start, r.period_end, r.is_correction,
         r.superseded_at, r.received_date, r.nav_amount, r.data_source, r.reviewed_at, u.name as reviewed_by_name,
         case when f.formation_date is not null and f.investment_period_years is not null
              then (f.formation_date + make_interval(years => f.investment_period_years))::date::text end as investment_period_end,
         c.result as check_result
  from reports r
  join funds f on f.id = r.fund_id
  join gps g on g.id = f.gp_id
  left join users u on u.id = r.reviewed_by
  left join lateral (select result from compliance_checks k where k.report_id = r.id order by k.created_at desc limit 1) c on true
  where r.org_id = ${orgId}
`;
const withView = <T extends Omit<ReportItem, "check_view">>(r: T): T & { check_view: CheckView | null } => ({
  ...r,
  check_view: r.check_result ? checkView(r.check_result, r.period_end, r.investment_period_end) : null,
});

export async function listReports(orgId: string, q: ReportListQuery = {}) {
  const rows = await sql<Omit<ReportItem, "check_view">[]>`
    select * from (${listQuery(sql, orgId)}) x
    where true
      ${q.unreviewed ? sql`and x.reviewed_at is null and x.superseded_at is null` : sql``}
      ${q.fund_id ? sql`and x.fund_id = ${q.fund_id}` : sql``}
    order by (x.reviewed_at is null and x.superseded_at is null) desc, x.period_end desc, x.received_date desc nulls last
    limit 300
  `;
  return rows.map(withView);
}

export async function getReport(orgId: string, reportId: string): Promise<ReportDetail> {
  assertUuid(reportId, "보고를");
  const [r] = await sql<(Omit<ReportItem, "check_view"> & { gp_comment: string | null; snapshot: Record<string, unknown> | null; primary_purpose_min_ratio: string | null })[]>`
    select x.*, r.gp_comment, r.snapshot, f.primary_purpose_min_ratio
    from (${listQuery(sql, orgId)}) x join reports r on r.id = x.id join funds f on f.id = x.fund_id
    where x.id = ${reportId}
  `;
  if (!r) throw notFound("보고를");
  const attachments = await sql<{ id: string; file_name: string; size_bytes: number | null }[]>`
    select id, file_name, size_bytes from attachments where org_id = ${orgId} and target_type = 'report' and target_id = ${reportId} and deleted_at is null order by created_at
  `;
  const checks = await sql<{ id: string; required_ratio: string | null; actual_ratio: string | null; result: "pass" | "fail"; memo: string | null; created_by_name: string | null; created_at: Date }[]>`
    select k.id, k.required_ratio, k.actual_ratio, k.result, k.memo, u.name as created_by_name, k.created_at
    from compliance_checks k left join users u on u.id = k.created_by
    where k.org_id = ${orgId} and k.report_id = ${reportId} order by k.created_at desc
  `;
  const num = (v: string | null) => (v === null ? null : Number(v));
  return {
    ...withView(r),
    primary_purpose_min_ratio: num(r.primary_purpose_min_ratio),
    attachments,
    checks: checks.map((k) => ({
      ...k,
      required_ratio: num(k.required_ratio),
      actual_ratio: num(k.actual_ratio),
      view: checkView(k.result, r.period_end, r.investment_period_end),
    })),
  };
}

// ─── 조건 준수 점검 (BR-CHK-01, L34) ─────────────────────────────────────────

// 필요 비율이 없는 조합(규약에 주목적 의무 비율 없음)은 점검하지 않는다. 실제 비율이 없으면 점검할 수 없다
async function recordCheck(db: Db, orgId: string, reportId: string, actual: number | null, memo: string | null, userId: string | null) {
  const [r] = await db<{ required: string | null }[]>`
    select f.primary_purpose_min_ratio as required from reports r join funds f on f.id = r.fund_id where r.id = ${reportId} and r.org_id = ${orgId}
  `;
  if (!r || r.required === null || actual === null) return null;
  const required = Number(r.required);
  const result = actual >= required ? "pass" : "fail";
  const [row] = await db<{ id: string }[]>`
    insert into compliance_checks (org_id, report_id, check_type, required_ratio, actual_ratio, result, memo, created_by)
    values (${orgId}, ${reportId}, 'primary_purpose', ${required}, ${Number(actual.toFixed(6))}, ${result}, ${memo}, ${userId})
    returning id
  `;
  return { id: row.id, result };
}

// 담당자가 점검 기록 (수기 보고, 또는 연동 보고 다시 점검). 연동이면 실제 비율은 GP 스냅샷 값으로 채운다
export async function addComplianceCheck(orgId: string, userId: string, reportId: string, input: ComplianceCheckInput) {
  const r = await getReport(orgId, reportId);
  if (r.primary_purpose_min_ratio === null) throw new AppError(422, "NO_REQUIREMENT", "이 조합에는 주목적 의무 비율이 없어 점검할 것이 없습니다. 조합 정보를 확인하세요", "BR-CHK-01");
  const fromGp = r.data_source === "gp_api" ? Number((r.snapshot as { totals?: { primary_purpose_ratio?: number } } | null)?.totals?.primary_purpose_ratio ?? NaN) : NaN;
  const actual = Number.isFinite(fromGp) ? fromGp : input.actual_ratio;
  if (actual === null || actual === undefined) {
    throw new AppError(400, "VALIDATION_ERROR", "실제 주목적 투자 비율을 입력하세요", "BR-CHK-01", { fields: { actual_ratio: "보고서의 주목적 투자 비율을 입력하세요" } });
  }
  await recordCheck(sql, orgId, reportId, actual, input.memo, userId);
  return getReport(orgId, reportId);
}

// ─── 검토 완료 (BR-RPT-04) ───────────────────────────────────────────────────

export async function reviewReport(orgId: string, userId: string, reportId: string) {
  assertUuid(reportId, "보고를");
  const [row] = await sql`
    update reports set reviewed_at = coalesce(reviewed_at, now()), reviewed_by = coalesce(reviewed_by, ${userId})
    where id = ${reportId} and org_id = ${orgId} returning id
  `;
  if (!row) throw notFound("보고를");
  return getReport(orgId, reportId);
}

// ─── 수기 보고 (BR-RPT-02·05) ────────────────────────────────────────────────

// 같은 기간(종류·종료일)에 대체되지 않은 보고를 대체한다
async function supersedeSamePeriod(tx: postgres.TransactionSql, fundId: string, periodType: PeriodType, periodEnd: string) {
  return tx`update reports set superseded_at = now() where fund_id = ${fundId} and period_type = ${periodType} and period_end = ${periodEnd} and superseded_at is null returning id`;
}

export async function createManualReport(orgId: string, userId: string, fundId: string, input: ReportCreateInput) {
  assertUuid(fundId, "조합을");
  const id = await sql.begin(async (tx) => {
    const t = tx as unknown as Db;
    const [f] = await tx<{ data_source: DataSource }[]>`select data_source from funds where id = ${fundId} and org_id = ${orgId} for update`;
    if (!f) throw notFound("조합을");
    if (f.data_source === "gp_api") throw new AppError(409, "GP_MANAGED_FIELD", "연동 조합의 보고는 GP에서 자동으로 들어옵니다", "BR-RPT-01");
    const [m] = await tx`select 1 from commitments where fund_id = ${fundId} and status = 'active'`;
    if (!m) throw new AppError(409, "COMMITMENT_NOT_ACTIVE", "활성 출자 건이 있는 조합만 보고를 기록합니다 (청산 확인 뒤에는 문서를 더하지 않음, BR-CLOSE-02)", "BR-CMT-07");
    if (input.period_start > input.period_end) throw new AppError(422, "INVALID_DATE", "기간 시작일이 종료일보다 늦습니다", "BR-RPT-02", { fields: { period_start: "시작일을 확인하세요" } });
    if (input.received_date < input.period_end) {
      throw new AppError(422, "INVALID_DATE", "받은 날은 보고 기간이 끝난 뒤여야 합니다", "BR-RPT-02", { fields: { received_date: "기간 종료일 이후 날짜를 입력하세요" } });
    }
    const [dup] = await tx`select 1 from reports where fund_id = ${fundId} and period_type = ${input.period_type} and period_end = ${input.period_end} and superseded_at is null`;
    if (dup && !input.is_correction) {
      throw new AppError(409, "DUPLICATE_REPORT", "같은 기간 보고가 이미 있습니다. 고친 보고라면 '정정 보고'로 등록하세요", "BR-RPT-02", { fields: { is_correction: "정정 보고로 등록하세요" } });
    }
    if (dup) await supersedeSamePeriod(tx, fundId, input.period_type, input.period_end);
    const [r] = await tx<{ id: string }[]>`
      insert into reports (org_id, fund_id, period_type, period_start, period_end, is_correction, received_date, gp_comment, nav_amount, data_source, created_by)
      values (${orgId}, ${fundId}, ${input.period_type}, ${input.period_start}, ${input.period_end}, ${Boolean(dup)}, ${input.received_date},
              ${input.gp_comment}, ${input.nav_amount}, 'manual', ${userId})
      returning id
    `;
    await recordCheck(t, orgId, r.id, input.primary_purpose_ratio, null, userId);
    return r.id;
  });
  return getReport(orgId, id);
}

// ─── 연동 보고 받기 (동기화에서 부른다, BR-RPT-01·05, L34·L36) ───────────────

type GpReport = {
  id: string;
  period_type: PeriodType;
  period_start: string;
  period_end: string;
  gp_comment: string | null;
  snapshot: { totals?: { primary_purpose_ratio?: number } } & Record<string, unknown>;
  published_at: string | null;
  is_correction: boolean;
  my: { ownership_ratio: number | null; nav_amount: number | null };
  attachments: { id: string; file_name: string; size_bytes: number | null }[];
};

const kstDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) : null);

// 발행 순서대로 저장. 새 보고면 같은 기간 이전 보고를 대체하고 조건 점검을 자동 기록한다. PDF는 목록만 (내용은 볼 때 GP에서)
export async function upsertGpReports(orgId: string, fundId: string, reports: GpReport[]) {
  const ordered = [...reports].sort((a, b) => String(a.published_at).localeCompare(String(b.published_at)));
  let created = 0;
  for (const g of ordered) {
    const made = await sql.begin(async (tx) => {
      const t = tx as unknown as Db;
      const [exists] = await tx<{ id: string }[]>`select id from reports where org_id = ${orgId} and gp_report_id = ${g.id}`;
      let reportId = exists?.id;
      if (!reportId) {
        await supersedeSamePeriod(tx, fundId, g.period_type, g.period_end);
        const [r] = await tx<{ id: string }[]>`
          insert into reports (org_id, fund_id, period_type, period_start, period_end, is_correction, received_date, gp_comment, snapshot, nav_amount, data_source, gp_report_id)
          values (${orgId}, ${fundId}, ${g.period_type}, ${g.period_start}, ${g.period_end}, ${g.is_correction}, ${kstDate(g.published_at)},
                  ${g.gp_comment}, ${tx.json(g.snapshot as never)}, ${g.my?.nav_amount ?? null}, 'gp_api', ${g.id})
          returning id
        `;
        reportId = r.id;
        const ratio = g.snapshot?.totals?.primary_purpose_ratio;
        await recordCheck(t, orgId, reportId, typeof ratio === "number" ? ratio : null, "보고 받을 때 자동 점검 (GP 스냅샷)", null);
      }
      for (const a of g.attachments ?? []) {
        await tx`
          insert into attachments (org_id, target_type, target_id, file_name, content_type, size_bytes, gp_attachment_id)
          select ${orgId}, 'report', ${reportId}, ${a.file_name}, 'application/pdf', ${a.size_bytes && a.size_bytes > 0 ? a.size_bytes : null}, ${a.id}
          where not exists (select 1 from attachments where org_id = ${orgId} and gp_attachment_id = ${a.id})
        `;
      }
      return !exists;
    });
    if (made) created++;
  }
  return { fetched: reports.length, created };
}
