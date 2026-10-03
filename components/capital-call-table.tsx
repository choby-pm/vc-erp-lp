import Link from "next/link";
import { formatDate, formatKRW } from "@/lib/format";
import { CALL_PAYMENT_STATUS_LABEL, CALL_PAYMENT_STATUS_STYLE, GP_PAYMENT_STATUS_LABEL } from "@/lib/labels";
import type { CapitalCallItem } from "@/lib/services/capital-calls";
import { CancelCallButton } from "@/components/capital-call-actions";

// 캐피탈콜 표 (R4-1). 회차를 누르면 캐피탈콜 상세(납입 기안·송금 기록, R4-2). 전체 목록과 출자 건 상세에서 같이 쓴다
// · 우리 쪽 납입 상태(계산값)와 GP가 본 납입 상태를 나란히 → "우리는 보냈는데 GP는 미납"이 보인다
export default function CapitalCallTable({ calls, showFund, canCancel }: { calls: CapitalCallItem[]; showFund: boolean; canCancel: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="whitespace-nowrap border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
          <tr>
            {showFund && <th className="px-4 py-3">조합</th>}
            <th className="px-4 py-3">회차</th>
            <th className="px-4 py-3">요청일 · 납입 기한</th>
            <th className="px-4 py-3 text-right">요청액</th>
            <th className="px-4 py-3 text-right">우리 송금</th>
            <th className="px-4 py-3">우리 납입 상태</th>
            <th className="px-4 py-3">GP가 본 상태</th>
            {canCancel && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {calls.map((c) => {
            const status = c.cancelled_at ? "cancelled" : c.payment_status;
            // 우리는 다 보냈는데 GP가 아직 완납으로 보지 않음 (GP 입금 확인 전이면 정상, L10)
            const gpBehind = c.data_source === "gp_api" && !c.cancelled_at && c.paid_amount > 0 && (c.gp_paid_amount ?? 0) < c.paid_amount;
            return (
              <tr key={c.id} className="align-top">
                {showFund && (
                  <td className="px-4 py-3">
                    <Link href={`/commitments/${c.commitment_id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                      {c.fund_name}
                    </Link>
                    <span className="block text-xs text-slate-400">{c.gp_name}</span>
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-3 text-slate-800">
                  <Link href={`/capital-calls/${c.id}`} className="font-medium hover:text-emerald-700">
                    {c.call_no}회{c.is_initial ? " (최초)" : ""}
                  </Link>
                  <span className="block text-xs text-slate-400">{c.data_source === "gp_api" ? "GP 연동" : "수기"}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                  {formatDate(c.call_date)}
                  <span className={`block text-xs ${status === "overdue" ? "font-semibold text-rose-600" : "text-slate-500"}`}>기한 {formatDate(c.due_date)}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                  {formatKRW(c.call_amount)}
                  {c.over_commitment && <span className="block text-xs font-semibold text-rose-600">약정 초과 요청</span>}
                  {c.purpose && <span className="block text-xs font-normal text-slate-500">{c.purpose}</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                  {formatKRW(c.paid_amount)}
                  {c.pending_amount > 0 && <span className="block text-xs text-slate-500">진행 중 {formatKRW(c.pending_amount)}</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CALL_PAYMENT_STATUS_STYLE[status]}`}>{CALL_PAYMENT_STATUS_LABEL[status]}</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {c.data_source === "gp_api" ? (
                    <>
                      {GP_PAYMENT_STATUS_LABEL[c.gp_payment_status ?? ""] ?? "-"} · {formatKRW(c.gp_paid_amount)}
                      {gpBehind && <span className="block text-amber-700">GP 입금 확인 전</span>}
                    </>
                  ) : (
                    <span className="text-slate-400">수기 (GP 정보 없음)</span>
                  )}
                </td>
                {canCancel && (
                  <td className="px-4 py-3 text-right">
                    {c.data_source === "manual" && !c.cancelled_at && c.paid_amount === 0 && <CancelCallButton callId={c.id} />}
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
