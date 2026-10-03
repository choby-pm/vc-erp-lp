import Link from "next/link";
import { DistributionRowActions } from "@/components/distribution-actions";
import { formatDate, formatKRW } from "@/lib/format";
import type { DistributionItem } from "@/lib/services/distributions";

// 분배 표 (R6-1). 전체 목록과 출자 건 상세에서 같이 쓴다
const STATUS: Record<string, [string, string]> = {
  announced: ["수령 대기", "bg-amber-100 text-amber-800"],
  received: ["수령", "bg-emerald-100 text-emerald-700"],
  cancelled: ["취소", "bg-slate-200 text-slate-500"],
};
const GP_STATUS: Record<string, string> = { confirmed: "확정 (지급 전)", paid: "지급함", cancelled: "취소" };
const COMPONENT: Record<string, string> = { return_of_capital: "원금 반환", hurdle_return: "기준수익", profit: "초과수익", carried_interest: "성과보수" };

export default function DistributionTable({ rows, showFund, canWrite }: { rows: DistributionItem[]; showFund: boolean; canWrite: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="whitespace-nowrap border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
          <tr>
            {showFund && <th className="px-4 py-3">조합</th>}
            <th className="px-4 py-3">회차 · 분배일</th>
            <th className="px-4 py-3 text-right">우리 몫</th>
            <th className="px-4 py-3">원금 반환 · 수익</th>
            <th className="px-4 py-3">상태</th>
            <th className="px-4 py-3">GP</th>
            {canWrite && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((d) => {
            const [label, style] = STATUS[d.status];
            const paidNotRecorded = d.status === "announced" && d.gp_status === "paid";
            return (
              <tr key={d.id} className="align-top">
                {showFund && (
                  <td className="px-4 py-3">
                    <Link href={`/commitments/${d.commitment_id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                      {d.fund_name}
                    </Link>
                    <span className="block text-xs text-slate-400">{d.gp_name}</span>
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-3 text-slate-800">
                  {d.distribution_no}회{d.is_final ? " (최종)" : ""}
                  <span className="block text-xs text-slate-500">{formatDate(d.distribution_date)}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">{formatKRW(d.amount)}</td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {formatKRW(d.return_of_capital_amount)} · {formatKRW(d.profit_amount)}
                  {d.gp_components && Object.keys(d.gp_components).length > 1 && (
                    <span className="block text-slate-400">
                      {Object.entries(d.gp_components)
                        .filter(([, v]) => v)
                        .map(([k, v]) => `${COMPONENT[k] ?? k} ${formatKRW(v)}`)
                        .join(" · ")}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>{label}</span>
                  {d.received_date && (
                    <span className="block text-xs text-slate-500">
                      {formatDate(d.received_date)}
                      {d.received_via === "imported" ? " · 가져온 수령 (GP 원장 근거)" : ""}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {d.data_source === "gp_api" ? (
                    <span className={paidNotRecorded ? "font-semibold text-amber-700" : "text-slate-600"}>
                      {GP_STATUS[d.gp_status ?? ""] ?? "-"}
                      {paidNotRecorded && <span className="block">수령 기록 전</span>}
                    </span>
                  ) : (
                    <span className="text-slate-400">수기</span>
                  )}
                </td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    {(d.status === "announced" || d.status === "received") && (
                      <DistributionRowActions id={d.id} status={d.status} canCorrect={d.received_via === "recorded"} />
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
