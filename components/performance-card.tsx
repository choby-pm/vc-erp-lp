import { formatDate, formatKRW } from "@/lib/format";
import type { Performance } from "@/lib/services/performance";

// 출자 건 성과 (R6-2): 배수 · IRR · 조정 평가액 · 현금흐름 (BR-PERF-01~04, L40)
export const multiple = (x: number | null) => (x === null ? "-" : `${x.toFixed(2)}x`);
export const pct = (x: number | null) => (x === null ? "-" : `${(x * 100).toFixed(1)}%`);
const KIND: Record<string, string> = { contribution: "납입", distribution: "분배", nav: "기준일 평가액" };

export default function PerformanceCard({ p, asOfForm }: { p: Performance; asOfForm?: React.ReactNode }) {
  const cards: [string, string, string?][] = [
    ["TVPI", multiple(p.tvpi), "(분배 + 평가액) ÷ 납입"],
    ["DPI", multiple(p.dpi), "분배 ÷ 납입"],
    ["RVPI", multiple(p.rvpi), "평가액 ÷ 납입"],
    ["IRR", pct(p.irr), p.irr_note ?? "날짜별 현금흐름 (XIRR)"],
  ];
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">
          성과 <span className="font-normal text-slate-500">· {formatDate(p.as_of)} 기준 · 우리 장부</span>
        </h2>
        {asOfForm}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {cards.map(([k, v, hint]) => (
          <div key={k} className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">{k}</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{v}</p>
            <p className="text-[11px] leading-4 text-slate-400">{hint}</p>
          </div>
        ))}
      </div>
      <dl className="grid gap-x-8 text-sm sm:grid-cols-2">
        {[
          ["약정", formatKRW(p.commitment_amount)],
          ["누적 납입", formatKRW(p.contribution_amount)],
          ["누적 분배", formatKRW(p.distribution_amount)],
          ["평가액 (조정)", p.nav.missing ? "평가액 없음 (보고 없음 → 0)" : formatKRW(p.nav.amount)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-slate-100 py-1.5">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-right font-medium tabular-nums text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
      {!p.nav.missing && p.nav.report_period_end && (
        <p className="text-xs text-slate-500">
          평가액 = {formatDate(p.nav.report_period_end)} 보고의 우리 몫 {formatKRW(p.nav.reported_amount)} + 이후 납입 {formatKRW(p.nav.contributions_after)} − 이후 분배 {formatKRW(p.nav.distributions_after)} (L40 ⚠️ 단순화)
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-xs font-medium text-emerald-700">현금흐름 {p.cashflows.length}건 (IRR 근거)</summary>
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {p.cashflows.map((f, i) => (
              <tr key={i}>
                <td className="py-1.5 text-slate-600">{formatDate(f.date)}</td>
                <td className="py-1.5 text-slate-600">{KIND[f.kind]}</td>
                <td className={`py-1.5 text-right ${f.amount < 0 ? "text-rose-600" : "text-slate-900"}`}>{formatKRW(f.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
