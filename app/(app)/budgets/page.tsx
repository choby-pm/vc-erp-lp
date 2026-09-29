import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { formatKRW } from "@/lib/format";
import { listBudgets } from "@/lib/services/budgets";

export const metadata = { title: "출자 예산 · VC ERP LP" };

// 연도별 출자 예산 (R2-1). 사용액 = 선정 승인 + 선정 결재 대기의 출자 예정액 (BR-BUD-03)
export default async function BudgetsPage() {
  const me = (await getCurrentUser())!;
  const budgets = await listBudgets(me.org_id);
  const canWrite = me.role === "admin" || me.role === "officer";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">출자 예산</h1>
          <p className="mt-1 text-sm text-slate-500">한 해 동안 새로 선정할 수 있는 금액. 선정 결재를 올릴 때와 승인할 때 예산 잔액을 검사합니다.</p>
        </div>
        {canWrite && (
          <Link href="/budgets/new" className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            + 예산 만들기
          </Link>
        )}
      </div>

      {budgets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">아직 예산이 없습니다.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {budgets.map((b) => {
            const usedRatio = b.total_amount > 0 ? b.used_amount / b.total_amount : 0;
            return (
              <Link key={b.id} href={`/budgets/${b.id}`} className="block rounded-2xl border border-slate-200 bg-white p-5 hover:border-emerald-300">
                <div className="flex items-baseline justify-between">
                  <p className="text-lg font-bold text-slate-900">{b.budget_year}년</p>
                  <p className="text-sm tabular-nums text-slate-500">총액 {formatKRW(b.total_amount)}</p>
                </div>
                <div className="mt-4 h-2.5 rounded-full bg-slate-100">
                  <div className="h-2.5 rounded-full bg-emerald-500" style={{ width: `${Math.min(usedRatio, 1) * 100}%` }} />
                </div>
                <dl className="mt-3 grid grid-cols-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">사용</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">{formatKRW(b.used_amount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">잔액</dt>
                    <dd className="font-semibold tabular-nums text-emerald-700">{formatKRW(b.remaining_amount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">분야 배분</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">{formatKRW(b.allocated_amount)}</dd>
                  </div>
                </dl>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
