import Link from "next/link";
import { ProgramActions, TrackTable } from "@/components/program-editor";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatKRW } from "@/lib/format";
import { PROGRAM_STATUSES, PROGRAM_STATUS_LABEL, PROPOSAL_STATUS_LABEL, PROPOSAL_STATUS_STYLE } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getProgram } from "@/lib/services/programs";
import { listProposals } from "@/lib/services/proposals";

export const metadata = { title: "출자사업 · VC ERP LP" };

// 출자사업 상세 (R2-2). 접수된 제안 목록은 R2-3에서 붙는다
export default async function ProgramDetailPage(props: PageProps<"/programs/[programId]">) {
  const { programId } = await props.params;
  const me = (await getCurrentUser())!;
  const program = await loadOrNotFound(() => getProgram(me.org_id, programId));
  const proposals = await listProposals(me.org_id, { program_id: program.id });
  const canWrite = me.role === "admin" || me.role === "officer";
  const isDraft = program.status === "draft";
  const step = PROGRAM_STATUSES.indexOf(program.status);
  const overBudget = program.planned_amount > program.budget_remaining_amount;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/programs" className="text-sm text-slate-500 hover:text-slate-700">
            ← 출자사업
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{program.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            접수 {formatDate(program.apply_start_date)} ~ {formatDate(program.apply_end_date)} ·{" "}
            <Link href={`/budgets/${program.budget_id}`} className="hover:text-emerald-700">
              {program.budget_year}년 예산
            </Link>
            {isDraft && canWrite && (
              <>
                {" · "}
                <Link href={`/programs/${program.id}/edit`} className="text-emerald-700 hover:underline">
                  사업 정보 수정
                </Link>
              </>
            )}
          </p>
        </div>
        {canWrite && <ProgramActions programId={program.id} status={program.status} />}
      </div>

      <ol className="grid grid-cols-4 gap-1 rounded-2xl border border-slate-200 bg-white p-3">
        {PROGRAM_STATUSES.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className={`rounded-lg px-2 py-2 text-center text-xs font-medium ${i === step ? "bg-emerald-600 text-white" : i < step ? "bg-emerald-50 text-emerald-700" : "text-slate-400"}`}
          >
            {PROGRAM_STATUS_LABEL[s]}
          </li>
        ))}
      </ol>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-xs text-slate-500">부문 출자 예정액 합계</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{formatKRW(program.planned_amount)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-xs text-slate-500">{program.budget_year}년 예산 잔액</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${overBudget ? "text-amber-600" : "text-emerald-700"}`}>{formatKRW(program.budget_remaining_amount)}</p>
          {overBudget && <p className="mt-1 text-xs text-amber-700">예정액 합계가 잔액을 넘습니다 (선정 때 다시 검사)</p>}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-xs text-slate-500">접수 · 선정</p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {program.proposal_count}건 · {program.selected_count}곳
          </p>
        </div>
      </div>

      <TrackTable programId={program.id} tracks={program.tracks} editable={isDraft && canWrite} />

      {!isDraft && (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">접수된 제안</h2>
            {canWrite && program.status === "open" && (
              <Link href="/proposals/new" className="text-sm font-semibold text-emerald-700 hover:underline">
                + 제안 접수
              </Link>
            )}
          </div>
          {proposals.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">아직 접수된 제안이 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {proposals.map((pr) => (
                  <tr key={pr.id}>
                    <td className="px-5 py-2.5">
                      <Link href={`/proposals/${pr.id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                        {pr.fund_name}
                      </Link>
                      <span className="ml-2 text-xs text-slate-500">{pr.gp_name}</span>
                    </td>
                    <td className="px-5 py-2.5 text-slate-600">{pr.track_name}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-700">{formatKRW(pr.requested_amount)}</td>
                    <td className="px-5 py-2.5 text-right text-slate-600">{pr.avg_score === null ? "-" : `${pr.avg_score}점`}</td>
                    <td className="px-5 py-2.5 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PROPOSAL_STATUS_STYLE[pr.status]}`}>{PROPOSAL_STATUS_LABEL[pr.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
