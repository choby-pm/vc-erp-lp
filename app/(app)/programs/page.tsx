import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatKRW } from "@/lib/format";
import { PROGRAM_STATUS_LABEL, PROGRAM_STATUS_STYLE } from "@/lib/labels";
import { listPrograms } from "@/lib/services/programs";

export const metadata = { title: "출자사업 · VC ERP LP" };

// 출자사업 공고 목록 (R2-2, 공고형 L3)
export default async function ProgramsPage() {
  const me = (await getCurrentUser())!;
  const programs = await listPrograms(me.org_id);
  const canWrite = me.role === "admin" || me.role === "officer";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">출자사업</h1>
          <p className="mt-1 text-sm text-slate-500">GP를 공개 모집하는 공고. 모집 부문별로 제안을 받아 심사·선정합니다.</p>
        </div>
        {canWrite && (
          <Link href="/programs/new" className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            + 출자사업 만들기
          </Link>
        )}
      </div>

      {programs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">아직 출자사업이 없습니다.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">사업</th>
                <th className="px-4 py-3">예산</th>
                <th className="px-4 py-3">접수 기간</th>
                <th className="px-4 py-3 text-right">부문 · 예정액</th>
                <th className="px-4 py-3 text-right">접수 · 선정</th>
                <th className="px-4 py-3">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {programs.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/programs/${p.id}`} className="font-semibold text-slate-900 hover:text-emerald-700">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.budget_year}년</td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(p.apply_start_date)} ~ {formatDate(p.apply_end_date)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {p.track_count}개 · {formatKRW(p.planned_amount)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {p.proposal_count}건 · {p.selected_count}곳
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PROGRAM_STATUS_STYLE[p.status]}`}>{PROGRAM_STATUS_LABEL[p.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
