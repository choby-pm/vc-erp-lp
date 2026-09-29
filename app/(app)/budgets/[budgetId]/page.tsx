import Link from "next/link";
import { AllocationEditor, BudgetTotalEditor } from "@/components/budget-editor";
import { getCurrentUser } from "@/lib/auth/session";
import { formatKRW } from "@/lib/format";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getBudget } from "@/lib/services/budgets";

export const metadata = { title: "출자 예산 · VC ERP LP" };

export default async function BudgetDetailPage(props: PageProps<"/budgets/[budgetId]">) {
  const { budgetId } = await props.params;
  const me = (await getCurrentUser())!;
  const budget = await loadOrNotFound(() => getBudget(me.org_id, budgetId));
  const canWrite = me.role === "admin" || me.role === "officer";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/budgets" className="text-sm text-slate-500 hover:text-slate-700">
          ← 출자 예산
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{budget.budget_year}년 출자 예산</h1>
        {budget.memo && <p className="mt-1 text-sm text-slate-500">{budget.memo}</p>}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="grid flex-1 gap-4 sm:grid-cols-3">
          {[
            ["예산 총액", budget.total_amount, "text-slate-900"],
            ["사용액", budget.used_amount, "text-slate-900"],
            ["잔액", budget.remaining_amount, "text-emerald-700"],
          ].map(([label, value, color]) => (
            <div key={label as string} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{formatKRW(value as number)}</p>
            </div>
          ))}
        </div>
        {canWrite && <BudgetTotalEditor budgetId={budget.id} total={budget.total_amount} memo={budget.memo} />}
      </div>

      <AllocationEditor budgetId={budget.id} total={budget.total_amount} rows={budget.strategies} canWrite={canWrite} />

      <p className="text-xs text-slate-500">
        사용액은 이 예산으로 선정된 출자 예정액(선정 결재 승인 + 결재 대기)의 합계입니다. 선정이 취소되면 예산이 다시 생깁니다. 선정 기능은 R2-4에서 추가됩니다.
      </p>
    </div>
  );
}
