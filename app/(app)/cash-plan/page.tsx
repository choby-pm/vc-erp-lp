import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { formatKRW } from "@/lib/format";
import { getCashPlan, thisMonth } from "@/lib/services/cash-plan";

export const metadata = { title: "자금 계획 · VC ERP LP" };

const monthLabel = (m: string) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`;

// 자금 계획 (R4-4, L29) ⚠️ 추정 방식 단순화
// 월별로 "확정"(받은 캐피탈콜 미납, 기한 달)과 "추정"(남은 약정을 투자 기간 끝까지 균등)을 나눠 보여준다
export default async function CashPlanPage(props: PageProps<"/cash-plan">) {
  const me = (await getCurrentUser())!;
  const { from: raw } = await props.searchParams;
  const from = typeof raw === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : thisMonth();
  const plan = await getCashPlan(me.org_id, from, 12);
  const sum = (k: "confirmed" | "estimated" | "total") => plan.months.reduce((s, m) => s + m[k], 0);

  const cards: [string, number, string][] = [
    ["12개월 필요 자금", sum("total"), "확정 + 추정"],
    ["확정 (받은 캐피탈콜)", sum("confirmed"), "납입 기한이 있는 달"],
    ["추정 (남은 약정)", sum("estimated"), "투자 기간 끝까지 균등"],
    ["기한 지난 미납", plan.overdue_unpaid, "지금 바로 낼 금액"],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">자금 계획</h1>
        <p className="mt-1 text-sm text-slate-500">
          앞으로 출자금이 언제 얼마나 필요한지. 받은 캐피탈콜의 미납은 <b>확정</b>, 아직 요청받지 않은 약정은 투자 기간 끝까지 매달 똑같이 나눈 <b>추정</b>입니다 ⚠️ 단순화한 추정 (L29).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">시작 달</span>
        {[-3, 0, 3, 12].map((d) => {
          const [y, m] = thisMonth().split("-").map(Number);
          const t = y * 12 + (m - 1) + d;
          const v = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
          return (
            <Link
              key={d}
              href={`/cash-plan?from=${v}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${from === v ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {d === 0 ? "이번 달" : monthLabel(v)}
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {cards.map(([label, value, hint]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${label === "기한 지난 미납" && value > 0 ? "text-rose-600" : "text-slate-900"}`}>{formatKRW(value)}</p>
            <p className="text-xs text-slate-400">{hint}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">월별 필요 자금</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="whitespace-nowrap border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-5 py-2.5">월</th>
                <th className="px-5 py-2.5 text-right">확정</th>
                <th className="px-5 py-2.5 text-right">추정</th>
                <th className="px-5 py-2.5 text-right">합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {plan.overdue_unpaid > 0 && (
                <tr className="bg-rose-50/60">
                  <td className="px-5 py-2 font-medium text-rose-700">기한 지난 미납</td>
                  <td className="px-5 py-2 text-right text-rose-700">{formatKRW(plan.overdue_unpaid)}</td>
                  <td className="px-5 py-2 text-right text-slate-400">-</td>
                  <td className="px-5 py-2 text-right font-semibold text-rose-700">{formatKRW(plan.overdue_unpaid)}</td>
                </tr>
              )}
              {plan.months.map((m) => (
                <tr key={m.month}>
                  <td className="px-5 py-2 text-slate-800">{monthLabel(m.month)}</td>
                  <td className="px-5 py-2 text-right text-slate-900">{m.confirmed ? formatKRW(m.confirmed) : "-"}</td>
                  <td className="px-5 py-2 text-right text-slate-500">{m.estimated ? formatKRW(m.estimated) : "-"}</td>
                  <td className="px-5 py-2 text-right font-semibold text-slate-900">{m.total ? formatKRW(m.total) : "-"}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 text-slate-600">
                <td className="px-5 py-2">조회 기간 이후</td>
                <td className="px-5 py-2 text-right">{plan.beyond_window.confirmed ? formatKRW(plan.beyond_window.confirmed) : "-"}</td>
                <td className="px-5 py-2 text-right">{plan.beyond_window.estimated ? formatKRW(plan.beyond_window.estimated) : "-"}</td>
                <td className="px-5 py-2 text-right">{formatKRW(plan.beyond_window.confirmed + plan.beyond_window.estimated)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="space-y-1 border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
          {plan.post_period_unfunded > 0 && <p>투자 기간이 끝난 조합의 남은 약정 {formatKRW(plan.post_period_unfunded)} — 관리보수·후속 투자 때만 요청되므로 월별로 추정하지 않습니다.</p>}
          {plan.unknown_period_unfunded > 0 && (
            <p className="text-amber-700">투자 기간 정보가 없어 추정하지 못한 남은 약정 {formatKRW(plan.unknown_period_unfunded)} — 아래 조합의 결성일·투자 기간을 채우면 추정에 들어갑니다.</p>
          )}
          {plan.awaiting_formation_planned > 0 && <p>참고: 결성 대기 출자 건의 출자 예정액 {formatKRW(plan.awaiting_formation_planned)} (결성 확인 뒤 약정이 되면 계획에 들어갑니다).</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">출자 건별 (활성)</h2>
        {plan.commitments.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">활성 출자 건이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="whitespace-nowrap border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-5 py-2.5">조합</th>
                  <th className="px-5 py-2.5 text-right">약정</th>
                  <th className="px-5 py-2.5 text-right">받은 요청 미납</th>
                  <th className="px-5 py-2.5 text-right">남은 약정</th>
                  <th className="px-5 py-2.5">투자 기간 끝</th>
                  <th className="px-5 py-2.5 text-right">월 추정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {plan.commitments.map((c) => (
                  <tr key={c.commitment_id}>
                    <td className="px-5 py-2.5">
                      <Link href={`/commitments/${c.commitment_id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                        {c.fund_name}
                      </Link>
                      <span className="block text-xs text-slate-400">
                        {c.gp_name} · {c.data_source === "gp_api" ? "GP 연동" : "수기"}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right">{formatKRW(c.commitment_amount)}</td>
                    <td className="px-5 py-2.5 text-right">{c.outstanding_calls ? formatKRW(c.outstanding_calls) : "-"}</td>
                    <td className="px-5 py-2.5 text-right">{formatKRW(c.unfunded_amount)}</td>
                    <td className="px-5 py-2.5 text-slate-700">
                      {c.investment_period_end ? monthLabel(c.investment_period_end) : <span className="text-amber-700">정보 없음</span>}
                      {c.bucket === "post_period" && <span className="block text-xs text-slate-500">투자 기간 종료</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right">{c.monthly_estimate ? formatKRW(c.monthly_estimate) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
