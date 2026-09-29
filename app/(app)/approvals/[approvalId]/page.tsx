import Link from "next/link";
import ApprovalDecision from "@/components/approval-decision";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, formatKRW, formatPercent } from "@/lib/format";
import { APPROVAL_STATUS_LABEL, APPROVAL_STATUS_STYLE, APPROVAL_TARGET_LABEL, PROPOSAL_CHANNEL_LABEL, STRATEGY_LABEL, type ProposalChannel, type Strategy } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getApproval } from "@/lib/services/approvals";
import { selectionCheck } from "@/lib/services/selection";

export const metadata = { title: "결재 · VC ERP LP" };

type SelectionSnapshot = {
  proposal: { fund_name: string; gp_name: string; requested_amount: number; channel: ProposalChannel; program_name: string | null; track_name: string | null; received_date: string };
  terms: { budget_year: number; planned_amount: number; max_commitment_ratio: number | null; formation_deadline: string; key_person_condition: string | null };
  numbers: {
    budget_total: number;
    budget_used_by_others: number;
    track_planned: number | null;
    track_used_by_others: number;
    strategy: Strategy;
    strategy_allocated: number;
    strategy_used_by_others: number;
    evaluation_count: number;
    avg_score: number | null;
  };
  warnings: string[];
};

// 결재 상세 (R2-4). 결재 화면은 기안 시점 스냅샷을 보여준다 (BR-APR-04) — 무엇을 결재하는지가 바뀌지 않게
export default async function ApprovalDetailPage(props: PageProps<"/approvals/[approvalId]">) {
  const { approvalId } = await props.params;
  const me = (await getCurrentUser())!;
  const a = await loadOrNotFound(() => getApproval(me.org_id, approvalId));
  const s = a.snapshot as SelectionSnapshot;
  const canDecide = a.status === "pending" && (me.role === "approver" || me.role === "admin") && a.requested_by !== me.id;
  // 결재 대기 중이면 지금 기준으로 다시 점검해 보여준다 (기안 뒤 다른 선정이 먼저 승인됐을 수 있다)
  const now = a.status === "pending" && a.target_type === "selection" ? await selectionCheck(me.org_id, a.target_id) : null;
  const nowBudget = now?.checks.find((c) => c.rule === "BR-BUD-04");
  const nowTrack = now?.checks.find((c) => c.rule === "BR-PRG-05");
  const n = s.numbers;

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/approvals" className="text-sm text-slate-500 hover:text-slate-700">
          ← 결재함
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">
            [{APPROVAL_TARGET_LABEL[a.target_type]}] {s.proposal.fund_name}
          </h1>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${APPROVAL_STATUS_STYLE[a.status]}`}>{APPROVAL_STATUS_LABEL[a.status]}</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          기안 {a.requested_by_name} · {formatDateTime(a.requested_at)}
          {a.request_comment && ` — ${a.request_comment}`} ·{" "}
          <Link href={`/proposals/${a.target_id}`} className="text-emerald-700 hover:underline">
            출자 제안 보기
          </Link>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-3">
          <h2 className="py-2 text-sm font-semibold text-slate-900">선정 조건 (기안 시점)</h2>
          <dl>
            {row("운용사 · 조합", `${s.proposal.gp_name} · ${s.proposal.fund_name}`)}
            {row("제안 경로", s.proposal.program_name ? `${s.proposal.program_name} · ${s.proposal.track_name}` : PROPOSAL_CHANNEL_LABEL[s.proposal.channel])}
            {row("요청 출자액", formatKRW(s.proposal.requested_amount))}
            {row("출자 예정액 (확약)", <span className="text-emerald-700">{formatKRW(s.terms.planned_amount)}</span>)}
            {row("결성 기한", formatDate(s.terms.formation_deadline))}
            {row("출자 비율 상한", s.terms.max_commitment_ratio === null ? "없음" : formatPercent(s.terms.max_commitment_ratio))}
            {row("핵심 운용 인력 조건", s.terms.key_person_condition ?? "없음")}
            {row("심사 평가", n.avg_score === null ? `${n.evaluation_count}건` : `${n.evaluation_count}건 · 평균 ${n.avg_score}점`)}
          </dl>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-3">
          <h2 className="py-2 text-sm font-semibold text-slate-900">예산 (기안 시점)</h2>
          <dl>
            {row(`${s.terms.budget_year}년 예산 총액`, formatKRW(n.budget_total))}
            {row("다른 선정·결재 대기", formatKRW(n.budget_used_by_others))}
            {row("이번 선정 후 잔액", formatKRW(n.budget_total - n.budget_used_by_others - s.terms.planned_amount))}
            {row(`${STRATEGY_LABEL[n.strategy]} 분야 배분 · 사용 후`, `${formatKRW(n.strategy_allocated)} · ${formatKRW(n.strategy_used_by_others + s.terms.planned_amount)}`)}
            {n.track_planned !== null && row("모집 부문 예정액 · 사용 후", `${formatKRW(n.track_planned)} · ${formatKRW(n.track_used_by_others + s.terms.planned_amount)}`)}
          </dl>
          {s.warnings.map((w) => (
            <p key={w} className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠ {w}
            </p>
          ))}
        </section>
      </div>

      {now && (nowBudget || nowTrack) && (
        <section className={`rounded-xl border px-4 py-3 text-sm ${nowBudget?.ok !== false && nowTrack?.ok !== false ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          <b>지금 기준 재점검</b> — {nowBudget && `예산: ${nowBudget.ok ? "통과" : "초과"} (${nowBudget.message})`}
          {nowTrack && ` · 부문: ${nowTrack.ok ? "통과" : "초과"} (${nowTrack.message})`}
          <span className="block text-xs opacity-80">승인할 때 이 기준으로 다시 검사합니다. 초과면 승인되지 않습니다 (BR-SEL-03).</span>
        </section>
      )}

      {a.status !== "pending" && (
        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm">
          <b>{APPROVAL_STATUS_LABEL[a.status]}</b> · {a.approver_name} · {formatDateTime(a.decided_at)}
          {a.decision_comment && <p className="mt-1 text-slate-600">{a.decision_comment}</p>}
        </section>
      )}
      {canDecide && <ApprovalDecision approvalId={a.id} />}
      {a.status === "pending" && a.requested_by === me.id && <p className="text-sm text-slate-500">본인이 올린 결재라 결재할 수 없습니다 (BR-APR-05).</p>}
    </div>
  );
}
