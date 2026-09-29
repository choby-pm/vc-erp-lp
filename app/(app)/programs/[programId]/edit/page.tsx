import { redirect } from "next/navigation";
import { ProgramForm } from "@/components/program-editor";
import { getCurrentUser } from "@/lib/auth/session";
import { loadOrNotFound } from "@/lib/page-helpers";
import { listBudgets } from "@/lib/services/budgets";
import { getProgram } from "@/lib/services/programs";

export const metadata = { title: "출자사업 수정 · VC ERP LP" };

export default async function EditProgramPage(props: PageProps<"/programs/[programId]/edit">) {
  const { programId } = await props.params;
  const me = (await getCurrentUser())!;
  const program = await loadOrNotFound(() => getProgram(me.org_id, programId));
  if (program.status !== "draft") redirect(`/programs/${program.id}`); // 공고 후에는 바꿀 수 없다 (BR-PRG-02)
  const budgets = (await listBudgets(me.org_id)).map((b) => ({ id: b.id, budget_year: b.budget_year }));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">출자사업 수정</h1>
      <ProgramForm budgets={budgets} program={program} />
    </div>
  );
}
