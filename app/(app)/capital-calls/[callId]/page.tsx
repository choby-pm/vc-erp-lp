import Link from "next/link";
import { NewPaymentForm, PaymentRowActions } from "@/components/payment-actions";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, formatKRW } from "@/lib/format";
import { CALL_PAYMENT_STATUS_LABEL, CALL_PAYMENT_STATUS_STYLE, GP_PAYMENT_STATUS_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_STYLE } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getCapitalCall } from "@/lib/services/capital-calls";
import { listPayments } from "@/lib/services/payments";

export const metadata = { title: "캐피탈콜 · VC ERP LP" };

// 캐피탈콜 상세 (R4-2): 요청 · 우리 납입(기안 → 결재 → 송금 완료) · GP가 본 납입
export default async function CapitalCallDetailPage(props: PageProps<"/capital-calls/[callId]">) {
  const { callId } = await props.params;
  const me = (await getCurrentUser())!;
  const c = await loadOrNotFound(() => getCapitalCall(me.org_id, callId));
  const payments = await listPayments(me.org_id, callId);
  const canWrite = me.role === "admin" || me.role === "officer";
  const left = c.call_amount - c.paid_amount - c.pending_amount;
  const status = c.cancelled_at ? "cancelled" : c.payment_status;
  const linked = c.data_source === "gp_api";

  const cards: [string, string][] = [
    ["요청액", formatKRW(c.call_amount)],
    ["우리 송금 완료", formatKRW(c.paid_amount)],
    ["결재·송금 진행 중", formatKRW(c.pending_amount)],
    ["GP가 본 납입", linked ? `${formatKRW(c.gp_paid_amount)} (${GP_PAYMENT_STATUS_LABEL[c.gp_payment_status ?? ""] ?? "-"})` : "수기 (GP 정보 없음)"],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/capital-calls" className="text-sm text-slate-500 hover:text-slate-700">
          ← 캐피탈콜
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">
            {c.fund_name} · {c.call_no}회{c.is_initial ? " (최초)" : ""}
          </h1>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${CALL_PAYMENT_STATUS_STYLE[status]}`}>{CALL_PAYMENT_STATUS_LABEL[status]}</span>
          {linked && <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">GP 연동</span>}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {c.gp_name} · 요청일 {formatDate(c.call_date)} · <span className={status === "overdue" ? "font-semibold text-rose-600" : ""}>납입 기한 {formatDate(c.due_date)}</span>
          {c.purpose && ` · ${c.purpose}`} ·{" "}
          <Link href={`/commitments/${c.commitment_id}`} className="text-emerald-700 hover:underline">
            출자 건
          </Link>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {linked && c.paid_amount > 0 && (c.gp_paid_amount ?? 0) < c.paid_amount && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          우리는 {formatKRW(c.paid_amount)}을 보냈는데 GP는 아직 {formatKRW(c.gp_paid_amount)}만 받은 것으로 봅니다. GP가 은행 입금을 확인해 기록하면 맞춰집니다 (송금 뒤 7일은 확인 대기, L10·L28).
        </p>
      )}

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">
            납입 <span className="font-normal text-slate-500">· 기안 → 결재 → 송금 완료. 나눠 낼 수 있습니다 (L9)</span>
          </h2>
          {canWrite && !c.cancelled_at && <NewPaymentForm callId={c.id} left={left} />}
        </div>
        {payments.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">아직 납입이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="whitespace-nowrap border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="py-2">기안</th>
                <th className="py-2 text-right">금액</th>
                <th className="py-2 pl-4">상태</th>
                <th className="py-2">송금일 · 이체 번호</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="py-2.5 text-slate-700">
                    {p.origin === "imported" ? (
                      <span className="text-xs text-slate-500">가져온 납입 (GP 원장 근거, 결재 없음 · L27)</span>
                    ) : (
                      <>
                        {p.created_by_name ?? "-"}
                        <span className="block text-xs text-slate-400">
                          {formatDateTime(p.created_at)}
                          {p.planned_date && ` · 예정 ${formatDate(p.planned_date)}`}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="py-2.5 text-right tabular-nums font-medium text-slate-900">{formatKRW(p.amount)}</td>
                  <td className="py-2.5 pl-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PAYMENT_STATUS_STYLE[p.status]}`}>{PAYMENT_STATUS_LABEL[p.status]}</span>
                    {p.approval_id && (
                      <Link href={`/approvals/${p.approval_id}`} className="ml-2 text-xs text-emerald-700 hover:underline">
                        결재 보기
                      </Link>
                    )}
                    {p.correction_memo && <span className="block text-xs text-slate-500">{p.correction_memo}</span>}
                  </td>
                  <td className="py-2.5 text-slate-700">
                    {p.paid_date ? formatDate(p.paid_date) : "-"}
                    {p.bank_reference && <span className="block text-xs text-slate-400">{p.bank_reference}</span>}
                  </td>
                  <td className="py-2.5 text-right">
                    {canWrite && p.origin === "approval" && (p.status === "approved" || p.status === "paid") && <PaymentRowActions paymentId={p.id} status={p.status} />}
                    {p.status === "requested" && <span className="text-xs text-slate-400">결재권자 결재 대기</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
