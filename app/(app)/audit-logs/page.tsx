import Link from "next/link";
import NoPermission from "@/components/no-permission";
import { isAdmin } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { listAuditLogs } from "@/lib/services/audit";

export const metadata = { title: "감사 로그 · VC ERP LP" };

const TABS = [
  { key: "all", label: "전체" },
  { key: "ok", label: "성공" },
  { key: "fail", label: "실패" },
  { key: "denied", label: "권한 없음" },
] as const;

// 감사 로그 (관리자, BR-AUTH-04). 우리 기관 기록만. 수정·삭제할 수 없다
export default async function AuditLogsPage(props: PageProps<"/audit-logs">) {
  const me = (await getCurrentUser())!;
  if (!isAdmin(me.role)) return <NoPermission area="감사 로그" role={me.role} />;

  const { result: raw } = await props.searchParams;
  const result = raw === "ok" || raw === "fail" || raw === "denied" ? raw : undefined;
  const logs = await listAuditLogs(me.org_id, { result });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">감사 로그</h1>
        <p className="mt-1 text-sm text-slate-500">누가 언제 무엇을 했는지 (쓰기·로그인). 최근 200건, 기록은 고칠 수 없습니다.</p>
      </div>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/audit-logs" : `/audit-logs?result=${t.key}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              (result ?? "all") === t.key ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {logs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">기록이 없습니다.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">일시</th>
                <th className="px-4 py-3">누가</th>
                <th className="px-4 py-3">무엇을</th>
                <th className="px-4 py-3">결과</th>
                <th className="px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">{formatDateTime(l.occurred_at)}</td>
                  <td className="px-4 py-2.5 text-slate-700">{l.user_name ?? (l.actor_type === "user" ? "-" : l.actor_type)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{l.action}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        l.status < 400 ? "bg-emerald-100 text-emerald-700" : l.status === 403 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {l.status}
                      {l.error_code ? ` ${l.error_code}` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{l.ip ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
