import Link from "next/link";
import FundStatusPanel from "@/components/fund-status-panel";
import FundStrategyEdit from "@/components/fund-strategy-edit";
import { ResyncButton } from "@/components/integration-actions";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, formatKRW, formatPercent } from "@/lib/format";
import { DATA_SOURCE_LABEL, FUND_STATUSES, FUND_STATUS_LABEL, FUND_TYPE_LABEL, STRATEGY_LABEL } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getFund } from "@/lib/services/funds";

export const metadata = { title: "조합 · VC ERP LP" };

// 조합 상세 (R1-3). 출자 제안·출자 건·장부는 R2부터 이 화면에 붙는다
export default async function FundDetailPage(props: PageProps<"/funds/[fundId]">) {
  const { fundId } = await props.params;
  const me = (await getCurrentUser())!;
  const fund = await loadOrNotFound(() => getFund(me.org_id, fundId));
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

      <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">
        출자 제안·심사·약정·납입 기록은 R2부터 이 화면에 추가됩니다.
      </section>
    </div>
  );
}
