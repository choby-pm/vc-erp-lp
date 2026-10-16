import { formatDate, formatKRW } from "@/lib/format";
import type { ObligationSnapshot } from "@/lib/schemas/obligations";
const labels = {
  not_started: "기간 전",
  in_progress: "진행 중 · 하한 미달 참고",
  met: "하한 충족",
  shortfall: "기간 종료 · 하한 미달",
  within_limit: "상한 이내",
  exceeded: "상한 초과",
  no_denominator: "약정액 없음 · 판정 불가",
};
export default function InvestmentObligations({
  snapshot,
}: {
  snapshot: ObligationSnapshot;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {formatDate(snapshot.as_of)} 기준 · GP 규약·담당자 판정 · 집행 원금
        기준. 기존 주목적 투자 비율과 별도입니다. LP에서 수정하지 않습니다.
      </p>
      {snapshot.obligations.length === 0 && (
        <p className="text-sm text-slate-500">
          이 기준일에 적용되는 의무가 없습니다. 기존 보고의 주목적 비율을 자동
          인정하지 않습니다.
        </p>
      )}
      {snapshot.obligations.map((o) => (
        <section
          key={o.id}
          className="rounded-xl border border-slate-200 bg-white p-4 space-y-2"
        >
          <h3 className="font-semibold">
            {o.name} · 의무 v{o.version} / 규약 v{o.terms_version}
          </h3>
          <p className="text-sm">
            {o.direction === "minimum" ? "하한" : "상한"}{" "}
            {o.measure === "amount"
              ? formatKRW(o.threshold)
              : `${o.threshold / 100}% (약정액 기준)`}{" "}
            · {labels[o.result]}
          </p>
          <p className="text-sm">
            인정액 {formatKRW(o.recognized_amount)} / 기준액{" "}
            {formatKRW(o.target_amount)}
            {o.actual_ratio === null
              ? ""
              : ` · 인정 투자 비율 ${(o.actual_ratio * 100).toFixed(2)}%`}
          </p>
          <p className="text-sm">
            {o.direction === "minimum"
              ? `의무 달성률 ${o.attainment_ratio === null ? "판정 불가" : `${(o.attainment_ratio * 100).toFixed(2)}%`}`
              : o.remaining_amount < 0
                ? `한도 초과액 ${formatKRW(-o.remaining_amount)}`
                : `한도 잔여 ${formatKRW(o.remaining_amount)}`}
          </p>
          <p className="text-xs text-slate-500">
            기간 {o.period_start} ~ {o.period_end} (당일 포함) · 적용일{" "}
            {o.effective_date} · {o.clause_reference}
          </p>
          <p className="text-sm whitespace-pre-wrap">{o.clause_text}</p>
          <ul className="text-sm space-y-2">
            {o.recognitions.map((r) => (
              <li key={r.id}>
                {r.company_name} · {r.investment_date} ·{" "}
                {r.decision === "cancelled"
                  ? "인정 취소"
                  : formatKRW(r.recognized_amount)}{" "}
                · {r.public_reason}
                {r.retroactive && " · 과거 거래 재판정"}
                <span className="block text-xs text-slate-400">
                  거래 {r.investment_id} · 판정 {r.id}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
