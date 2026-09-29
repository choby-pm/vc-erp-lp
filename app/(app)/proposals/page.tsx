import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatKRW } from "@/lib/format";
import { FINAL_PROPOSAL_STATUSES, PROPOSAL_CHANNEL_LABEL, PROPOSAL_STATUS_LABEL, PROPOSAL_STATUS_STYLE, REVIEW_STAGES, type ProposalStatus } from "@/lib/labels";
import { listProposals } from "@/lib/services/proposals";

export const metadata = { title: "출자 제안 · VC ERP LP" };

const FILTERS: { key: string; label: string }[] = [
  { key: "open", label: "심사 중" },
  ...REVIEW_STAGES.map((s) => ({ key: s, label: PROPOSAL_STATUS_LABEL[s] })),
  { key: "closed", label: "결정됨" },
];

// 출자 제안 목록 (R2-3). 공고형·개별 제안을 한 목록에서 같은 심사 흐름으로 본다 (L3)
export default async function ProposalsPage(props: PageProps<"/proposals">) {
  const me = (await getCurrentUser())!;
  const { status: raw } = await props.searchParams;
  const status = FILTERS.find((f) => f.key === raw)?.key ?? "open";
  const [list, all] = await Promise.all([listProposals(me.org_id, { status: status as never }), listProposals(me.org_id)]);
  const count = (key: string) =>
    key === "open"
      ? all.filter((p) => !(FINAL_PROPOSAL_STATUSES as readonly string[]).includes(p.status)).length
      : key === "closed"
        ? all.filter((p) => (FINAL_PROPOSAL_STATUSES as readonly string[]).includes(p.status)).length
        : all.filter((p) => p.status === key).length;
  const canWrite = me.role === "admin" || me.role === "officer";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">출자 제안</h1>
          <p className="mt-1 text-sm text-slate-500">GP가 보낸 출자 요청. 공고 접수와 개별 제안을 같은 심사 단계로 진행합니다.</p>
        </div>
        {canWrite && (
          <Link href="/proposals/new" className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            + 제안 접수
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "open" ? "/proposals" : `/proposals?status=${f.key}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${status === f.key ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {f.label} {count(f.key)}
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">해당하는 출자 제안이 없습니다.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">조합 · 운용사</th>
                <th className="px-4 py-3">경로</th>
                <th className="px-4 py-3 text-right">요청 출자액</th>
                <th className="px-4 py-3">접수일</th>
                <th className="px-4 py-3 text-right">평가</th>
                <th className="px-4 py-3">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/proposals/${p.id}`} className="font-semibold text-slate-900 hover:text-emerald-700">
                      {p.fund_name}
                    </Link>
                    <p className="text-xs text-slate-500">{p.gp_name}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {PROPOSAL_CHANNEL_LABEL[p.proposal_channel]}
                    {p.program_name && <p className="text-xs text-slate-500">{p.program_name} · {p.track_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatKRW(p.requested_amount)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(p.received_date)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{p.avg_score === null ? "-" : `${p.avg_score}점 (${p.evaluation_count})`}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PROPOSAL_STATUS_STYLE[p.status as ProposalStatus]}`}>{PROPOSAL_STATUS_LABEL[p.status as ProposalStatus]}</span>
                    {p.data_source === "gp_api" && <span className="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">GP 연동</span>}
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
