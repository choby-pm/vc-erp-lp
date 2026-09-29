import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { formatKRW } from "@/lib/format";
import { DATA_SOURCE_LABEL, FUND_STATUSES, FUND_STATUS_LABEL, STRATEGY_LABEL, type FundStatus } from "@/lib/labels";
import { listFunds } from "@/lib/services/funds";

export const metadata = { title: "조합 · VC ERP LP" };

const STATUS_STYLE: Record<FundStatus, string> = {
  planning: "bg-slate-100 text-slate-600",
  fundraising: "bg-amber-100 text-amber-800",
  formed: "bg-sky-100 text-sky-700",
  operating: "bg-emerald-100 text-emerald-700",
  dissolved: "bg-violet-100 text-violet-700",
  liquidated: "bg-slate-200 text-slate-500",
};

// 조합 목록 (R1-3). 우리 기관이 출자했거나 검토 중인 조합만 보인다
export default async function FundsPage(props: PageProps<"/funds">) {
  const me = (await getCurrentUser())!;
  const { status: raw } = await props.searchParams;
  const status = FUND_STATUSES.find((s) => s === raw);
  const [funds, all] = await Promise.all([listFunds(me.org_id, { status }), status ? listFunds(me.org_id) : null]);
  const counts = new Map<string, number>();
  for (const f of all ?? funds) counts.set(f.status, (counts.get(f.status) ?? 0) + 1);
  const total = (all ?? funds).length;
  const canWrite = me.role === "admin" || me.role === "officer";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">조합</h1>
          <p className="mt-1 text-sm text-slate-500">우리 기관이 출자했거나 출자를 검토하는 조합. 연동 GP의 조합은 자동으로 들어옵니다.</p>
        </div>
        {canWrite && (
          <Link href="/funds/new" className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            + 조합 등록
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/funds" className={`rounded-full border px-3 py-1 text-xs font-medium ${!status ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          전체 {total}
        </Link>
        {FUND_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/funds?status=${s}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${status === s ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {FUND_STATUS_LABEL[s]} {counts.get(s) ?? 0}
          </Link>
        ))}
      </div>

      {funds.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">
          {status ? "해당 상태의 조합이 없습니다." : "등록된 조합이 없습니다. 운용사를 먼저 등록한 뒤 조합을 등록하세요."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">조합</th>
                <th className="px-4 py-3">운용사</th>
                <th className="px-4 py-3">분야</th>
                <th className="px-4 py-3">빈티지</th>
                <th className="px-4 py-3 text-right">결성액 (목표)</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">출처</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {funds.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/funds/${f.id}`} className="font-semibold text-slate-900 hover:text-emerald-700">
                      {f.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/gps/${f.gp_id}`} className="text-slate-600 hover:text-emerald-700">
                      {f.gp_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{STRATEGY_LABEL[f.strategy]}</td>
                  <td className="px-4 py-3 text-slate-600">{f.vintage_year ?? "-"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {f.fund_size_amount ? formatKRW(f.fund_size_amount) : <span className="text-slate-400">({formatKRW(f.target_amount)})</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[f.status]}`}>{FUND_STATUS_LABEL[f.status]}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{DATA_SOURCE_LABEL[f.data_source]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
