import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatKRW } from "@/lib/format";
import { DATA_SOURCE_LABEL, FUND_STATUS_LABEL, GP_TYPE_LABEL, STRATEGY_LABEL } from "@/lib/labels";
import { getGp } from "@/lib/services/gps";
import { loadOrNotFound } from "@/lib/page-helpers";

export const metadata = { title: "운용사 · VC ERP LP" };

// 운용사 상세 (R1-2). 다른 기관의 운용사 ID로 들어오면 "없음" (BR-ORG-03)
export default async function GpDetailPage(props: PageProps<"/gps/[gpId]">) {
  const { gpId } = await props.params;
  const me = (await getCurrentUser())!;
  const gp = await loadOrNotFound(() => getGp(me.org_id, gpId));
  const canWrite = me.role === "admin" || me.role === "officer";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/gps" className="text-sm text-slate-500 hover:text-slate-700">
            ← 운용사
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {gp.name}
            {gp.is_linked && <span className="ml-3 align-middle rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">GP 연동</span>}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {GP_TYPE_LABEL[gp.gp_type]} · 등록 {formatDate(gp.created_at)}
          </p>
        </div>
        {canWrite && (
          <Link href={`/gps/${gp.id}/edit`} className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            수정
          </Link>
        )}
      </div>

      {gp.is_linked && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <b>{gp.connection_name}</b> 시스템과 연동된 운용사입니다. 이 GP의 조합·캐피탈콜·분배·보고는 GP에서 자동으로 들어옵니다 (R3).
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-xs text-slate-500">운용 규모</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{formatKRW(gp.aum_amount)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-xs text-slate-500">GP 담당자</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{gp.contact_name ?? "-"}</p>
          <p className="text-xs text-slate-500">{[gp.contact_email, gp.contact_phone].filter(Boolean).join(" · ") || "연락처 없음"}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-xs text-slate-500">우리 기관의 조합</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{gp.fund_count}개</p>
        </div>
      </div>

      {gp.memo && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">내부 메모</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{gp.memo}</p>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">조합</h2>
          {canWrite && !gp.is_linked && (
            <Link href={`/funds/new?gp_id=${gp.id}`} className="text-sm font-semibold text-emerald-700 hover:underline">
              + 조합 등록
            </Link>
          )}
        </div>
        {gp.funds.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">아직 이 운용사의 조합이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-5 py-2">조합</th>
                <th className="px-5 py-2">분야</th>
                <th className="px-5 py-2">빈티지</th>
                <th className="px-5 py-2">상태</th>
                <th className="px-5 py-2">출처</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {gp.funds.map((f) => (
                <tr key={f.id}>
                  <td className="px-5 py-2.5">
                    <Link href={`/funds/${f.id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                      {f.name}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5 text-slate-600">{STRATEGY_LABEL[f.strategy]}</td>
                  <td className="px-5 py-2.5 text-slate-600">{f.vintage_year ?? "-"}</td>
                  <td className="px-5 py-2.5 text-slate-600">{FUND_STATUS_LABEL[f.status]}</td>
                  <td className="px-5 py-2.5 text-slate-600">{DATA_SOURCE_LABEL[f.data_source]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
