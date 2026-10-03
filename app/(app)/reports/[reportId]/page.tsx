import Link from "next/link";
import { CheckForm, ReviewButton } from "@/components/report-actions";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, formatKRW, formatPercent } from "@/lib/format";
import { CHECK_VIEW_LABEL, CHECK_VIEW_STYLE, reportPeriodLabel } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getReport } from "@/lib/services/reports";

export const metadata = { title: "GP 보고 · VC ERP LP" };

type Snapshot = {
  totals?: Partial<Record<string, number | null>>;
  portfolio?: { company_name: string; invested_amount: number; current_value_amount: number; status: string }[];
};
const PORTFOLIO_STATUS: Record<string, string> = { holding: "보유", partially_exited: "일부 회수", exited: "회수 완료" };

// 보고 상세 (R5-2): GP 스냅샷 그대로 · 우리 몫 평가액 · 보고서 PDF · 조건 준수 점검 · 검토 완료
export default async function ReportDetailPage(props: PageProps<"/reports/[reportId]">) {
  const { reportId } = await props.params;
  const me = (await getCurrentUser())!;
  const r = await loadOrNotFound(() => getReport(me.org_id, reportId));
  const canWrite = me.role === "admin" || me.role === "officer";
  const s = (r.snapshot ?? {}) as Snapshot;
  const t = s.totals ?? {};
  const linked = r.data_source === "gp_api";

  const cards: [string, string][] = [
    ["기준일", formatDate(r.period_end)],
    ["받은 날", formatDate(r.received_date)],
    ["우리 몫 평가액", r.nav_amount === null ? "-" : formatKRW(r.nav_amount)],
    ["검토", r.reviewed_at ? `${r.reviewed_by_name} · ${formatDate(r.reviewed_at)}` : "미검토"],
  ];
  const totals: [string, string][] = linked
    ? [
        ["약정 총액", formatKRW(t.commitment_amount)],
        ["누적 납입 (납입률)", `${formatKRW(t.paid_amount)} (${formatPercent(t.paid_ratio, 1)})`],
        ["누적 투자 · 투자 잔액", `${formatKRW(t.invested_amount)} · ${formatKRW(t.invested_balance_amount)}`],
        ["보유 기업 평가액", formatKRW(t.current_value_amount)],
        ["현금 잔액", formatKRW(t.cash_amount)],
        ["누적 회수 · 분배", `${formatKRW(t.proceeds_amount)} · ${formatKRW(t.distributed_amount)}`],
        ["누적 관리보수", formatKRW(t.fee_amount)],
        ["주목적 투자 비율", formatPercent(t.primary_purpose_ratio, 1)],
        ["TVPI (조합 전체)", t.tvpi === null || t.tvpi === undefined ? "-" : `${Number(t.tvpi).toFixed(2)}배`],
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/reports" className="text-sm text-slate-500 hover:text-slate-700">
            ← GP 보고
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">
              {r.fund_name} · {reportPeriodLabel(r.period_type, r.period_start)} 보고
            </h1>
            {linked ? <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">GP 연동</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">수기</span>}
            {r.is_correction && <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">정정 보고</span>}
            {r.superseded_at && <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">정정 보고로 대체됨</span>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {r.gp_name} · 기간 {formatDate(r.period_start)} ~ {formatDate(r.period_end)} ·{" "}
            <Link href={`/funds/${r.fund_id}`} className="text-emerald-700 hover:underline">
              조합
            </Link>
          </p>
        </div>
        {canWrite && !r.reviewed_at && !r.superseded_at && <ReviewButton reportId={r.id} />}
      </div>

      {r.superseded_at && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          같은 기간의 정정 보고가 들어와 이 보고는 대체됐습니다 ({formatDateTime(r.superseded_at)}). 평가액·점검·보고 기한 판정에는 정정 보고를 씁니다 (BR-RPT-05).
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {linked && (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">조합 숫자 (GP 스냅샷 그대로)</h2>
          <dl className="grid gap-x-8 px-5 py-3 text-sm sm:grid-cols-2">
            {totals.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-slate-100 py-2">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium tabular-nums text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
          {(s.portfolio?.length ?? 0) > 0 && (
            <table className="w-full border-t border-slate-200 text-sm">
              <thead className="text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-5 py-2">투자 기업</th>
                  <th className="px-5 py-2 text-right">투자액</th>
                  <th className="px-5 py-2 text-right">평가액</th>
                  <th className="px-5 py-2">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {s.portfolio!.map((p) => (
                  <tr key={p.company_name}>
                    <td className="px-5 py-2 text-slate-800">{p.company_name}</td>
                    <td className="px-5 py-2 text-right">{formatKRW(p.invested_amount)}</td>
                    <td className="px-5 py-2 text-right">{formatKRW(p.current_value_amount)}</td>
                    <td className="px-5 py-2 text-slate-600">{PORTFOLIO_STATUS[p.status] ?? p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {(r.gp_comment || r.attachments.length > 0) && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm">
          {r.gp_comment && (
            <div>
              <h2 className="text-xs font-semibold text-slate-500">GP 의견</h2>
              <p className="mt-1 whitespace-pre-wrap text-slate-800">{r.gp_comment}</p>
            </div>
          )}
          {r.attachments.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-slate-500">보고서 파일 (GP에서 바로 받아 보여줍니다)</h2>
              <ul className="mt-1 space-y-1">
                {r.attachments.map((a) => (
                  <li key={a.id}>
                    <a href={`/api/v1/reports/${r.id}/attachments/${a.id}`} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
                      {a.file_name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">
            약정 조건 준수 점검 <span className="font-normal text-slate-500">· 주목적 의무 비율 {r.primary_purpose_min_ratio === null ? "없음" : formatPercent(r.primary_purpose_min_ratio)}</span>
          </h2>
          {canWrite && r.primary_purpose_min_ratio !== null && !r.superseded_at && <CheckForm reportId={r.id} linked={linked} />}
        </div>
        <p className="text-xs text-slate-500">
          투자 기간{r.investment_period_end ? `(${formatDate(r.investment_period_end)}까지)` : ""} 중 보고의 미달은 참고로만 봅니다. 의무 비율은 보통 투자 기간이 끝날 때 채우면 되기 때문입니다 (L34).
        </p>
        {r.checks.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-400">{r.primary_purpose_min_ratio === null ? "이 조합에는 점검할 의무 비율이 없습니다." : "점검 기록이 없습니다."}</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {r.checks.map((k) => (
              <li key={k.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHECK_VIEW_STYLE[k.view]}`}>{CHECK_VIEW_LABEL[k.view]}</span>
                  <span className="ml-2 tabular-nums text-slate-700">
                    실제 {formatPercent(k.actual_ratio, 1)} / 필요 {formatPercent(k.required_ratio, 1)}
                  </span>
                  {k.memo && <span className="ml-2 text-slate-500">— {k.memo}</span>}
                </span>
                <span className="text-xs text-slate-500">
                  {k.created_by_name ?? "자동"} · {formatDateTime(k.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
