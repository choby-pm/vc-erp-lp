import Link from "next/link";
import { ProgramForm } from "@/components/program-editor";
import { getCurrentUser } from "@/lib/auth/session";
import { listBudgets } from "@/lib/services/budgets";

export const metadata = { title: "출자사업 만들기 · VC ERP LP" };

export default async function NewProgramPage() {
  const me = (await getCurrentUser())!;
  const budgets = (await listBudgets(me.org_id)).map((b) => ({ id: b.id, budget_year: b.budget_year }));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">출자사업 만들기</h1>
      {budgets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">
          출자사업은 예산으로 선정합니다. 먼저{" "}
          <Link href="/budgets/new" className="font-semibold text-emerald-700 underline">
            예산을 만드세요
          </Link>
          .
        </div>
      ) : (
        <ProgramForm budgets={budgets} />
      )}
    </div>
  );
}
