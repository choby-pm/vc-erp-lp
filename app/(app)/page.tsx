import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { formatDate } from "@/lib/format";
import { getAlerts, type AlertGroup } from "@/lib/services/alerts";

export const metadata = { title: "대시보드 · VC ERP LP" };

const TONE: Record<AlertGroup["tone"], { box: string; badge: string }> = {
  red: { box: "border-rose-200", badge: "bg-rose-100 text-rose-700" },
  amber: { box: "border-amber-200", badge: "bg-amber-100 text-amber-800" },
  sky: { box: "border-sky-200", badge: "bg-sky-100 text-sky-700" },
  slate: { box: "border-slate-200", badge: "bg-slate-100 text-slate-700" },
};

// 대시보드 (R5-4): 주의 목록 — 처리할 일을 한곳에. 저장하지 않고 열 때마다 계산한다 (04 14장)
// 예산 사용·포트폴리오 합계·30일 일정은 R7에서 더한다
export default async function Home() {
  const user = (await getCurrentUser())!;
  const groups = await getAlerts(user.org_id, user);
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  const urgent = groups.filter((g) => g.tone === "red").reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">대시보드</h1>
        <p className="mt-1 text-sm text-slate-500">
          {user.org_name} · {user.name} ({ROLE_LABEL[user.role]})
        </p>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">주의 목록</h2>
          <p className="text-sm text-slate-500">{total === 0 ? "처리할 일이 없습니다" : `처리할 일 ${total}건${urgent ? ` · 급한 것 ${urgent}건` : ""}`}</p>
        </div>
        {groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">결재·납입·보고·투표 모두 처리할 것이 없습니다.</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.map((g) => (
              <section key={g.key} className={`rounded-2xl border bg-white ${TONE[g.tone].box}`}>
                <h3 className="flex items-center justify-between border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">
                  {g.label}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[g.tone].badge}`}>{g.items.length}</span>
                </h3>
                <ul className="divide-y divide-slate-100">
                  {g.items.slice(0, 6).map((it, i) => (
                    <li key={i}>
                      <Link href={it.href} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm hover:bg-slate-50">
                        <span className="min-w-0">
                          <span className="font-medium text-slate-900">{it.title}</span>
                          <span className="block text-xs text-slate-500">{it.detail}</span>
                        </span>
                        {it.date && <span className="shrink-0 text-xs text-slate-400">{formatDate(it.date)}</span>}
                      </Link>
                    </li>
                  ))}
                  {g.items.length > 6 && <li className="px-5 py-2 text-xs text-slate-400">외 {g.items.length - 6}건</li>}
                </ul>
              </section>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-400">예산 사용·포트폴리오 합계·30일 일정은 R7에서 이 화면에 더합니다.</p>
      </section>
    </div>
  );
}
