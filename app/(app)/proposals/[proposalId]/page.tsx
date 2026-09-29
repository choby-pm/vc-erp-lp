import Link from "next/link";
import EvaluationPanel from "@/components/evaluation-panel";
import ProposalActions from "@/components/proposal-actions";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, formatKRW, formatPercent } from "@/lib/format";
import { FINAL_PROPOSAL_STATUSES, FUND_STATUS_LABEL, PROPOSAL_CHANNEL_LABEL, PROPOSAL_STATUS_LABEL, PROPOSAL_STATUS_STYLE, REVIEW_STAGES } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import ProposalEdit from "@/components/proposal-edit";
import SelectionPanel from "@/components/selection-panel";
import { sql } from "@/lib/db";
import { approvalsForTarget } from "@/lib/services/approvals";
import { listBudgets } from "@/lib/services/budgets";
import { listCriteria, listEvaluations, weightSum } from "@/lib/services/evaluations";
import { getProposal } from "@/lib/services/proposals";
import { getSelectionTerms, selectionCheck } from "@/lib/services/selection";

export const metadata = { title: "출자 제안 · VC ERP LP" };

// 출자 제안 상세: 심사 단계 · 선정 조건 · 선정 결재 · 평가 · 이력 (R2-3, R2-4)
export default async function ProposalDetailPage(props: PageProps<"/proposals/[proposalId]">) {
  const { proposalId } = await props.params;
  const me = (await getCurrentUser())!;
  const p = await loadOrNotFound(() => getProposal(me.org_id, proposalId));
  const [criteria, evals, terms, check, approvals, budgets] = await Promise.all([
    listCriteria(me.org_id),
    listEvaluations(me.org_id, proposalId),
    getSelectionTerms(me.org_id, proposalId),
    selectionCheck(me.org_id, proposalId),
    approvalsForTarget(me.org_id, "selection", proposalId),
    listBudgets(me.org_id),
  ]);
  const [programBudget] = p.program_id ? await sql<{ budget_id: string }[]>`select budget_id from programs where id = ${p.program_id}` : [];
  const [commitment] = await sql<{ id: string; status: string }[]>`select id, status from commitments where proposal_id = ${proposalId} and org_id = ${me.org_id}`;
  const isFinal = (FINAL_PROPOSAL_STATUSES as readonly string[]).includes(p.status);
  const canWrite = me.role === "admin" || me.role === "officer";
  const canEvaluate = me.role !== "viewer" && !isFinal;
  const reached = new Set<string>(p.history.map((h) => h.to_status));
  // 거쳐 온 심사 단계 중 가장 뒤 단계. 그 앞에서 거치지 않은 단계는 건너뛴 것
  const lastReached = Math.max(...REVIEW_STAGES.map((s, i) => (reached.has(s) ? i : -1)));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/proposals" className="text-sm text-slate-500 hover:text-slate-700">
          ← 출자 제안
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{p.fund_name}</h1>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${PROPOSAL_STATUS_STYLE[p.status]}`}>{PROPOSAL_STATUS_LABEL[p.status]}</span>
          {p.data_source === "gp_api" && <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">GP 연동</span>}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          <Link href={`/gps/${p.gp_id}`} className="hover:text-emerald-700">
            {p.gp_name}
          </Link>{" "}
          ·{" "}
          <Link href={`/funds/${p.fund_id}`} className="hover:text-emerald-700">
            조합 정보 ({FUND_STATUS_LABEL[p.fund_status]})
          </Link>
        </p>
      </div>

      {/* 심사 단계 (건너뛴 단계는 흐리게) */}
      <ol className="grid grid-cols-6 gap-1 rounded-2xl border border-slate-200 bg-white p-3">
        {[...REVIEW_STAGES, isFinal ? p.status : "selected"].map((s, i) => {
          const current = s === p.status;
          const skipped = !current && !reached.has(s) && i < lastReached;
          return (
            <li
              key={s}
              aria-current={current ? "step" : undefined}
              className={`rounded-lg px-2 py-2 text-center text-xs font-medium ${
                current
                  ? p.status === "rejected" || p.status === "withdrawn"
                    ? "bg-rose-600 text-white"
                    : "bg-emerald-600 text-white"
                  : reached.has(s)
                    ? "bg-emerald-50 text-emerald-700"
                    : skipped
                      ? "text-slate-300 line-through"
                      : "text-slate-400"
              }`}
            >
              {PROPOSAL_STATUS_LABEL[s]}
            </li>
          );
        })}
      </ol>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["요청 출자액", formatKRW(p.requested_amount)],
          ["목표 결성액", formatKRW(p.target_amount)],
          ["제안 경로", p.program_name ? `${p.program_name} · ${p.track_name}` : PROPOSAL_CHANNEL_LABEL[p.proposal_channel]],
          ["접수일 · 결정일", `${formatDate(p.received_date)}${p.decided_date ? ` · ${formatDate(p.decided_date)}` : ""}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {p.program_track_id && (p.track_min_fund_size_amount || p.track_max_commitment_ratio !== null) && (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          부문 조건: {p.track_min_fund_size_amount ? `결성 ${formatKRW(p.track_min_fund_size_amount)} 이상` : "결성 규모 제한 없음"} ·{" "}
          {p.track_max_commitment_ratio !== null ? `출자 비율 ${formatPercent(p.track_max_commitment_ratio)} 이하` : "출자 비율 제한 없음"}
        </p>
      )}
      {p.memo && <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">내부 메모: {p.memo}</p>}
      {canWrite && !isFinal && !p.pending_approval && p.data_source === "manual" && (
        <ProposalEdit proposalId={p.id} requestedAmount={p.requested_amount} receivedDate={p.received_date} memo={p.memo} />
      )}

      {p.pending_approval && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          선정 결재 대기 중입니다. 결재가 끝날 때까지 심사 단계·선정 조건을 바꿀 수 없습니다 (BR-APR-03).
        </p>
      )}
      {commitment && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          선정되어 출자 건이 만들어졌습니다 — {commitment.status === "awaiting_formation" ? "결성 대기" : commitment.status}.{" "}
          <Link href={`/funds/${p.fund_id}`} className="font-semibold underline">
            조합 화면
          </Link>
          에서 결성 확인을 이어갑니다 (R3).
        </p>
      )}

      {canWrite && !isFinal && !p.pending_approval && <ProposalActions proposalId={p.id} status={p.status} isManual={p.data_source === "manual"} />}

      {(terms || (!isFinal && canWrite)) && (
        <SelectionPanel
          proposalId={p.id}
          requestedAmount={p.requested_amount}
          budgets={budgets.map((b) => ({ id: b.id, budget_year: b.budget_year }))}
          fixedBudgetId={programBudget?.budget_id ?? null}
          defaultMaxRatio={p.track_max_commitment_ratio}
          terms={terms}
          check={check}
          approvals={approvals}
          editable={canWrite && !isFinal && !p.pending_approval}
          canRequest={canWrite && !isFinal && !p.pending_approval}
        />
      )}

      <EvaluationPanel
        proposalId={p.id}
        myId={me.id}
        canEvaluate={canEvaluate}
        stages={p.evaluable_stages}
        criteria={criteria.map((c) => ({ id: c.id, name: c.name, weight_ratio: c.weight_ratio }))}
        weightSum={weightSum(criteria)}
        evaluations={evals.evaluations}
        stageAverages={evals.stage_averages}
        overallAvg={evals.overall_avg}
      />

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">단계 이력</h2>
        <ol className="divide-y divide-slate-100">
          {p.history.map((h, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-2.5 text-sm">
              <span className="text-slate-800">
                {h.from_status ? `${PROPOSAL_STATUS_LABEL[h.from_status]} → ` : ""}
                <b>{PROPOSAL_STATUS_LABEL[h.to_status]}</b>
                {h.note && <span className="ml-2 text-slate-500">— {h.note}</span>}
              </span>
              <span className="text-xs text-slate-500">
                {h.changed_by_name ?? "-"} · {formatDateTime(h.changed_at)}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
