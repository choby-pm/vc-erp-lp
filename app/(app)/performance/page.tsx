import Link from "next/link";
import { multiple, pct } from "@/components/performance-card";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatKRW } from "@/lib/format";
import { portfolioPerformance, todayKst, type GroupBy, type MetricRow } from "@/lib/services/performance";

export const metadata = { title: "성과 · VC ERP LP" };

const GROUPS: [GroupBy, string][] = [
  ["vintage", "빈티지"],
  ["strategy", "분야"],
  ["gp", "운용사"],
  ["source", "연동 · 수기"],
];

function MetricCells({ r }: { r: MetricRow }) {
  return (
    <>
      <td className="px-4 py-2.5 text-right">{formatKRW(r.commitment_amount)}</td>
      <td className="px-4 py-2.5 text-right">{formatKRW(r.contribution_amount)}</td>
      <td className="px-4 py-2.5 text-right">{formatKRW(r.distribution_amount)}</td>
      <td className="px-4 py-2.5 text-right">
        {formatKRW(r.nav_amount)}
        {r.nav_missing_count > 0 && <span className="block text-[11px] text-amber-700">평가액 없음 {r.nav_missing_count}건</span>}
      </td>
      <td className="px-4 py-2.5 text-right font-semibold">{multiple(r.tvpi)}</td>
      <td className="px-4 py-2.5 text-right">{multiple(r.dpi)}</td>
      <td className="px-4 py-2.5 text-right">{multiple(r.rvpi)}</td>
      <td className="px-4 py-2.5 text-right" title={r.irr_note ?? undefined}>
        {pct(r.irr)}
      </td>
    </>
  );
}

const HEAD = ["약정", "납입", "분배", "평가액 (조정)", "TVPI", "DPI", "RVPI", "IRR"];

// 포트폴리오 성과 (R6-3, BR-PERF-05·06, L42). 우리 장부 기준. 배수는 금액 합계로, IRR은 현금흐름을 합쳐 한 번
export default async function PerformancePage(props: PageProps<"/performance">) {
  const me = (await getCurrentUser())!;
  const sp = await props.searchParams;
  const asOf = typeof sp.as_of === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.as_of) ? sp.as_of : todayKst();
  const groupBy = GROUPS.find(([g]) => g === sp.group_by)?.[0] ?? "vintage";
  const p = await portfolioPerformance(me.org_id, asOf, groupBy);
  const t = p.total;

  const cards: [string, string, string][] = [
    ["TVPI", multiple(t.tvpi), "(분배 + 평가액) ÷ 납입"],
    ["DPI", multiple(t.dpi), "분배 ÷ 납입"],
    ["RVPI", multiple(t.rvpi), "평가액 ÷ 납입"],
    ["IRR (합산)", pct(t.irr), t.irr_note ?? "모든 현금흐름을 합쳐 한 번 계산"],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">성과</h1>
          <p className="mt-1 text-sm text-slate-500">
            {formatDate(asOf)} 기준 · 우리 장부 · 활성·청산 출자 건 {t.count}건. 평가액은 최근 보고 + 이후 납입 − 이후 분배 (L40 ⚠️ 단순화)
          </p>
        </div>
        <form className="flex items-center gap-2 text-sm text-slate-500">
          <input type="hidden" name="group_by" value={groupBy} />
          기준일
          <input type="date" name="as_of" defaultValue={asOf} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          <button className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50">보기</button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {cards.map(([k, v, hint]) => (
          <div key={k} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs text-slate-500">{k}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{v}</p>
            <p className="text-xs text-slate-400">{hint}</p>
          </div>
        ))}
      </div>

      {t.nav_missing_count > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          보고가 없어 평가액을 0으로 계산한 출자 건이 {t.nav_missing_count}건 있습니다. 납입한 돈의 가치를 0으로 보므로 TVPI·IRR이 실제보다 낮게 나옵니다 (BR-PERF-02). 출자 건별 표에서 &ldquo;평가액 없음&rdquo;을 확인하세요.
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">모아 보기</h2>
          <div className="flex gap-1">
            {GROUPS.map(([g, label]) => (
              <Link
                key={g}
                href={`/performance?group_by=${g}&as_of=${asOf}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${groupBy === g ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm tabular-nums">
            <thead className="whitespace-nowrap border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-2.5">{GROUPS.find(([g]) => g === groupBy)![1]}</th>
                <th className="px-4 py-2.5 text-right">건수</th>
                {HEAD.map((h) => (
                  <th key={h} className="px-4 py-2.5 text-right">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {p.groups.map((g) => (
                <tr key={g.key}>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{g.label}</td>
                  <td className="px-4 py-2.5 text-right">{g.count}</td>
                  <MetricCells r={g} />
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-2.5 text-slate-900">전체</td>
                <td className="px-4 py-2.5 text-right">{t.count}</td>
                <MetricCells r={t} />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">출자 건별</h2>
        {p.commitments.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">기준일까지 장부 기록이 있는 활성·청산 출자 건이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm tabular-nums">
              <thead className="whitespace-nowrap border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">조합</th>
                  {HEAD.map((h) => (
                    <th key={h} className="px-4 py-2.5 text-right">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {p.commitments.map((c) => (
                  <tr key={c.commitment_id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/commitments/${c.commitment_id}?as_of=${asOf}`} className="font-medium text-slate-900 hover:text-emerald-700">
                        {c.fund_name}
                      </Link>
                      <span className="block text-xs text-slate-400">
                        {c.gp_name} · {c.vintage_year ?? "-"} · {c.data_source === "gp_api" ? "GP 연동" : "수기"}
                      </span>
                    </td>
                    <MetricCells r={c} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-xs text-slate-400">IRR에 마우스를 올리면 계산하지 않은 이유가 보입니다. 결성 대기·선정 취소 출자 건은 뺍니다 (BR-PERF-06). 차트는 R7 대시보드에서 (L42).</p>
    </div>
  );
}
