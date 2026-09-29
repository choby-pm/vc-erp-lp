import { BudgetCreateForm } from "@/components/budget-editor";

export const metadata = { title: "예산 만들기 · VC ERP LP" };

export default function NewBudgetPage() {
  const year = Number(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 4));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">예산 만들기</h1>
      <BudgetCreateForm defaultYear={year} />
    </div>
  );
}
