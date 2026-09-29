import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDateTime, formatKRW } from "@/lib/format";
import { APPROVAL_STATUS_LABEL, APPROVAL_STATUS_STYLE, APPROVAL_TARGET_LABEL } from "@/lib/labels";
import { listApprovals } from "@/lib/services/approvals";

export const metadata = { title: "결재함 · VC ERP LP" };

const BOXES = [
  { key: "to_me", label: "결재할 것" },
  { key: "mine", label: "내가 올린 것" },
  { key: "all", label: "전체" },
] as const;
const STATUSES = [
  { key: "pending", label: "대기" },
  { key: "approved", label: "승인" },
  { key: "rejected", label: "반려" },
  { key: "all", label: "전체" },
] as const;

// 결재함 (R2-4, L4). 선정 · 납입(R4) · 투표(R5) 결재를 한곳에서 본다
export default async function ApprovalsPage(props: PageProps<"/approvals">) {
  const me = (await getCurrentUser())!;
  const sp = await props.searchParams;
  const canDecide = me.role === "approver" || me.role === "admin";
  const box = BOXES.find((b) => b.key === sp.box)?.key ?? (canDecide ? "to_me" : "mine");
  const status = STATUSES.find((s) => s.key === sp.status)?.key ?? "pending";
  const list = await listApprovals(me.org_id, me.id, { box, status });
  const href = (b: string, s: string) => `/approvals?box=${b}&status=${s}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">결재함</h1>
        <p className="mt-1 text-sm text-slate-500">출자 선정·납입·총회 투표는 결재를 거쳐야 진행됩니다. 본인이 올린 결재는 결재할 수 없습니다.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          {BOXES.map((b) => (
            <Link key={b.key} href={href(b.key, status)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${box === b.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {b.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-2">
          {STATUSES.map((s) => (
            <Link
              key={s.key}
              href={href(box, s.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${status === s.key ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">해당하는 결재가 없습니다.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">결재</th>
                <th className="px-4 py-3 text-right">금액</th>
                <th className="px-4 py-3">기안</th>
                <th className="px-4 py-3">결재</th>
                <th className="px-4 py-3">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((a) => {
                const terms = (a.snapshot as { terms?: { planned_amount?: number } }).terms;
                return (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/approvals/${a.id}`} className="font-semibold text-slate-900 hover:text-emerald-700">
                        [{APPROVAL_TARGET_LABEL[a.target_type]}] {a.title}
                      </Link>
                      {a.request_comment && <p className="text-xs text-slate-500">{a.request_comment}</p>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{terms?.planned_amount ? formatKRW(terms.planned_amount) : "-"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {a.requested_by_name}
                      <p className="text-xs text-slate-400">{formatDateTime(a.requested_at)}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {a.approver_name ?? "-"}
                      {a.decided_at && <p className="text-xs text-slate-400">{formatDateTime(a.decided_at)}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${APPROVAL_STATUS_STYLE[a.status]}`}>{APPROVAL_STATUS_LABEL[a.status]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
