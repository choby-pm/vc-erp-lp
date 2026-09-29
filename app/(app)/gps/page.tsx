import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { formatKRW } from "@/lib/format";
import { GP_TYPE_LABEL } from "@/lib/labels";
import { listGps } from "@/lib/services/gps";

export const metadata = { title: "운용사 · VC ERP LP" };

// 운용사 목록 (R1-2). 우리 기관이 관리하는 GP만 보인다
export default async function GpsPage(props: PageProps<"/gps">) {
  const me = (await getCurrentUser())!;
  const { q: raw } = await props.searchParams;
  const q = typeof raw === "string" ? raw.trim().slice(0, 100) : "";
  const gps = await listGps(me.org_id, q || undefined);
  const canWrite = me.role === "admin" || me.role === "officer";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">운용사</h1>
          <p className="mt-1 text-sm text-slate-500">출자했거나 출자를 검토하는 GP. 연동된 GP는 데이터가 자동으로 들어옵니다.</p>
        </div>
        {canWrite && (
          <Link href="/gps/new" className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            + 운용사 등록
          </Link>
        )}
      </div>

      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="운용사명 검색" className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">검색</button>
      </form>

      {gps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">
          {q ? "검색 결과가 없습니다." : "등록된 운용사가 없습니다."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">운용사</th>
                <th className="px-4 py-3">유형</th>
                <th className="px-4 py-3 text-right">운용 규모</th>
                <th className="px-4 py-3">담당자</th>
                <th className="px-4 py-3 text-right">조합</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {gps.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/gps/${g.id}`} className="font-semibold text-slate-900 hover:text-emerald-700">
                      {g.name}
                    </Link>
                    {g.is_linked && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">GP 연동</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{GP_TYPE_LABEL[g.gp_type]}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatKRW(g.aum_amount)}</td>
                  <td className="px-4 py-3 text-slate-600">{g.contact_name ?? "-"}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{g.fund_count > 0 ? `${g.fund_count}개` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
