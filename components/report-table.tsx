import Link from "next/link";
import { formatDate, formatKRW } from "@/lib/format";
import { CHECK_VIEW_LABEL, CHECK_VIEW_STYLE, reportPeriodLabel } from "@/lib/labels";
import type { ReportItem } from "@/lib/services/reports";

// 보고 표 (R5-2). 전체 목록과 조합 화면에서 같이 쓴다
export default function ReportTable({ reports, showFund }: { reports: ReportItem[]; showFund: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="whitespace-nowrap border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
          <tr>
            {showFund && <th className="px-4 py-3">조합</th>}
            <th className="px-4 py-3">보고</th>
            <th className="px-4 py-3">받은 날</th>
            <th className="px-4 py-3 text-right">우리 몫 평가액</th>
            <th className="px-4 py-3">조건 점검</th>
            <th className="px-4 py-3">검토</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {reports.map((r) => (
            <tr key={r.id} className={r.superseded_at ? "text-slate-400" : ""}>
              {showFund && (
                <td className="px-4 py-3">
                  <span className="font-medium text-slate-900">{r.fund_name}</span>
                  <span className="block text-xs text-slate-400">{r.gp_name}</span>
                </td>
              )}
              <td className="px-4 py-3">
                <Link href={`/reports/${r.id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                  {reportPeriodLabel(r.period_type, r.period_start)} 보고
                </Link>
                <span className="block text-xs text-slate-400">
                  기준일 {formatDate(r.period_end)} · {r.data_source === "gp_api" ? "GP 연동" : "수기"}
                  {r.is_correction && " · 정정 보고"}
                  {r.superseded_at && " · 정정 보고로 대체됨"}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDate(r.received_date)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{r.nav_amount === null ? "-" : formatKRW(r.nav_amount)}</td>
              <td className="px-4 py-3">
                {r.check_view ? (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHECK_VIEW_STYLE[r.check_view]}`}>{CHECK_VIEW_LABEL[r.check_view]}</span>
                ) : (
                  <span className="text-xs text-slate-400">점검 없음</span>
                )}
              </td>
              <td className="px-4 py-3 text-xs">
                {r.reviewed_at ? (
                  <span className="text-slate-500">
                    {r.reviewed_by_name} · {formatDate(r.reviewed_at)}
                  </span>
                ) : r.superseded_at ? (
                  <span className="text-slate-400">-</span>
                ) : (
                  <span className="font-semibold text-amber-700">미검토</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
