import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatKRW } from "@/lib/format";
import {
  COMMITMENT_ORIGIN_LABEL,
  COMMITMENT_STATUSES,
  COMMITMENT_STATUS_LABEL,
  COMMITMENT_STATUS_STYLE,
  DATA_SOURCE_LABEL,
  RECON_STATUS_LABEL,
  RECON_STATUS_STYLE,
} from "@/lib/labels";
import { listCommitments } from "@/lib/services/commitments";

export const metadata = { title: "출자 건 · VC ERP LP" };

// 출자 건 목록 (R3-6). 선정 결재로 생긴 출자 건 + 연동 GP에서 가져온 출자 건. 납입·분배·성과는 R4·R6에서 더한다
export default async function CommitmentsPage(props: PageProps<"/commitments">) {
  const me = (await getCurrentUser())!;
  const { status: raw } = await props.searchParams;
  const status = COMMITMENT_STATUSES.find((s) => s === raw);
  const all = await listCommitments(me.org_id);
  const rows = status ? all.filter((c) => c.status === status) : all;
  const count = (s: string) => all.filter((c) => c.status === s).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">출자 건</h1>
        <p className="mt-1 text-sm text-slate-500">
          선정 결재가 승인되면 결성 대기로 생기고, 조합 결성을 확인하면 활성이 됩니다. 연동 GP에 이미 출자한 조합은 가져온 출자 건으로 들어옵니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/commitments" className={`rounded-full border px-3 py-1 text-xs font-medium ${!status ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          전체 {all.length}
        </Link>
        {COMMITMENT_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/commitments?status=${s}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${status === s ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {COMMITMENT_STATUS_LABEL[s]} {count(s)}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">
          {status ? "해당 상태의 출자 건이 없습니다." : "출자 건이 없습니다. 출자 제안을 선정 결재로 승인하면 생깁니다."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="whitespace-nowrap border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">조합</th>
                <th className="px-4 py-3">운용사</th>
                <th className="px-4 py-3">생긴 경로</th>
                <th className="px-4 py-3 text-right">출자 예정액</th>
                <th className="px-4 py-3 text-right">약정액 (우리 장부)</th>
                <th className="px-4 py-3">약정 대사</th>
                <th className="px-4 py-3">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/commitments/${c.id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                      {c.fund_name}
                    </Link>
                    <span className="ml-1 text-xs text-slate-400">{DATA_SOURCE_LABEL[c.data_source]}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{c.gp_name}</td>
                  <td className="px-4 py-3 text-slate-600">{COMMITMENT_ORIGIN_LABEL[c.origin]}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{c.planned_amount ? formatKRW(c.planned_amount) : "-"}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">{c.commitment_amount ? formatKRW(c.commitment_amount) : "-"}</td>
                  <td className="px-4 py-3">
                    {c.data_source === "manual" ? (
                      <span className="text-xs text-slate-400">대사 대상 아님</span>
                    ) : c.recon_status ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RECON_STATUS_STYLE[c.recon_status]}`}>{RECON_STATUS_LABEL[c.recon_status]}</span>
                    ) : (
                      <span className="text-xs text-slate-400">결성 확인 전</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COMMITMENT_STATUS_STYLE[c.status]}`}>{COMMITMENT_STATUS_LABEL[c.status]}</span>
                    {c.confirmed_date && <span className="ml-1 text-xs text-slate-400">{formatDate(c.confirmed_date)}</span>}
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
