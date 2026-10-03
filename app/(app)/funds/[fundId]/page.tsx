import Link from "next/link";
import FundStatusPanel from "@/components/fund-status-panel";
import FundStrategyEdit from "@/components/fund-strategy-edit";
import { ResyncButton } from "@/components/integration-actions";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, formatKRW, formatPercent } from "@/lib/format";
import { DATA_SOURCE_LABEL, FUND_STATUSES, FUND_STATUS_LABEL, FUND_TYPE_LABEL, STRATEGY_LABEL } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getFund } from "@/lib/services/funds";
import { listNotices } from "@/lib/services/notices";
import { listReports } from "@/lib/services/reports";
import ReportTable from "@/components/report-table";
import { NewMeetingForm } from "@/components/meeting-actions";
import { listMeetings } from "@/lib/services/meetings";
import { NewReportForm } from "@/components/report-actions";
import { sql } from "@/lib/db";
import { MEETING_TYPE_LABEL, NOTICE_TYPE_LABEL } from "@/lib/labels";

export const metadata = { title: "조합 · VC ERP LP" };

// 조합 상세 (R1-3). 출자 제안·출자 건·장부는 R2부터 이 화면에 붙는다
export default async function FundDetailPage(props: PageProps<"/funds/[fundId]">) {
  const { fundId } = await props.params;
  const me = (await getCurrentUser())!;
  const fund = await loadOrNotFound(() => getFund(me.org_id, fundId));
  const notices = (await listNotices(me.org_id, { fund_id: fund.id })).slice(0, 5);
  const reports = await listReports(me.org_id, { fund_id: fund.id });
  const meetings = await listMeetings(me.org_id, { fund_id: fund.id });
  const [activeCommitment] = await sql`select 1 from commitments where fund_id = ${fund.id} and org_id = ${me.org_id} and status in ('active', 'closed')`;
  const isOfficer = me.role === "admin" || me.role === "officer";
  const canWrite = isOfficer && fund.data_source === "manual";
  const step = FUND_STATUSES.indexOf(fund.status);

  const rows: [string, React.ReactNode][] = [
    ["조합 유형", FUND_TYPE_LABEL[fund.fund_type]],
    // 연동 조합도 분야는 LP 쪽 분류라 여기서 고른다 (R3-5)
    ["분야", isOfficer && fund.data_source === "gp_api" ? <FundStrategyEdit fundId={fund.id} strategy={fund.strategy} /> : STRATEGY_LABEL[fund.strategy]],
    ["목표 결성액", formatKRW(fund.target_amount)],
    ["결성액", formatKRW(fund.fund_size_amount)],
    ["결성일 (빈티지)", fund.formation_date ? `${formatDate(fund.formation_date)} (${fund.vintage_year})` : "-"],
    ["존속 · 투자 기간", `${fund.term_years ?? "-"}년 · ${fund.investment_period_years ?? "-"}년`],
    ["만기일", formatDate(fund.maturity_date)],
    ["관리보수율 (연)", formatPercent(fund.management_fee_rate)],
    ["성과보수율 · 기준수익률", `${formatPercent(fund.carry_rate)} · ${formatPercent(fund.hurdle_rate)}`],
    ["주목적 투자 분야", fund.primary_purpose ?? "-"],
    ["주목적 의무 비율", formatPercent(fund.primary_purpose_min_ratio)],
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/funds" className="text-sm text-slate-500 hover:text-slate-700">
            ← 조합
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{fund.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            <Link href={`/gps/${fund.gp_id}`} className="hover:text-emerald-700">
              {fund.gp_name}
            </Link>{" "}
            · {DATA_SOURCE_LABEL[fund.data_source]}
          </p>
        </div>
        {canWrite && (
          <Link href={`/funds/${fund.id}/edit`} className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            수정
          </Link>
        )}
      </div>

      {/* 생애주기 단계 표시 */}
      <ol className="grid grid-cols-6 gap-1 rounded-2xl border border-slate-200 bg-white p-3">
        {FUND_STATUSES.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className={`rounded-lg px-2 py-2 text-center text-xs font-medium ${
              i === step ? "bg-emerald-600 text-white" : i < step ? "bg-emerald-50 text-emerald-700" : "text-slate-400"
            }`}
          >
            {FUND_STATUS_LABEL[s]}
          </li>
        ))}
      </ol>

      {fund.data_source === "gp_api" && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <p>
            GP에서 받은 조합입니다. 정보와 상태는 GP와 동기화될 때만 바뀝니다 (분야는 LP 쪽 분류라 직접 고릅니다). 마지막 동기화: {fund.last_synced_at ? formatDateTime(fund.last_synced_at) : "-"}
          </p>
          {isOfficer && <ResyncButton fundId={fund.id} />}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">조합 정보</h2>
        <dl className="grid gap-x-8 px-5 py-4 text-sm sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0 sm:[&:nth-last-child(2)]:border-0">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {canWrite && <FundStatusPanel fundId={fund.id} status={fund.status} hasFormation={fund.formation_date !== null} />}

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">GP 보고</h2>
          {canWrite && activeCommitment && <NewReportForm fundId={fund.id} />}
        </div>
        {reports.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">
            {fund.data_source === "gp_api" ? "GP가 발행한 보고가 아직 없습니다. 발행하면 자동으로 들어옵니다." : activeCommitment ? "입력한 보고가 없습니다." : "결성 확인된 출자 건이 생기면 보고를 기록합니다."}
          </p>
        ) : (
          <ReportTable reports={reports} showFund={false} />
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">총회</h2>
          {canWrite && activeCommitment && <NewMeetingForm fundId={fund.id} />}
        </div>
        {meetings.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-400">{fund.data_source === "gp_api" ? "GP가 소집한 총회가 없습니다." : "입력한 총회가 없습니다."}</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {meetings.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <Link href={`/meetings/${m.id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                  {MEETING_TYPE_LABEL[m.meeting_type] ?? m.meeting_type} · {formatDate(m.meeting_date)}
                </Link>
                <span className="text-xs text-slate-500">
                  안건 {m.agenda_count}건 · {m.can_vote ? "투표 가능" : m.status === "held" ? "개최 완료" : m.status === "cancelled" ? "취소" : "투표 마감"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">최근 통지</h2>
          <Link href="/notices?box=all" className="text-xs text-emerald-700 hover:underline">
            통지함
          </Link>
        </div>
        {notices.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-400">이 조합에서 받은 통지가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {notices.map((n) => (
              <li key={n.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-2.5 text-sm">
                <span className="text-slate-800">
                  <span className="mr-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{NOTICE_TYPE_LABEL[n.notice_type]}</span>
                  {n.title}
                </span>
                <span className={`text-xs ${n.acknowledged_at ? "text-slate-400" : "font-semibold text-emerald-700"}`}>
                  {formatDateTime(n.sent_at)} · {n.acknowledged_at ? "확인함" : "미확인"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
