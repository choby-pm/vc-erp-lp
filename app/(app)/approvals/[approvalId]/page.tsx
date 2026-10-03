import Link from "next/link";
import ApprovalDecision from "@/components/approval-decision";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, formatKRW, formatPercent } from "@/lib/format";
import { MEETING_TYPE_LABEL, VOTE_CHOICE_LABEL, APPROVAL_STATUS_LABEL, APPROVAL_STATUS_STYLE, APPROVAL_TARGET_LABEL, PROPOSAL_CHANNEL_LABEL, STRATEGY_LABEL, type ProposalChannel, type Strategy } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { sql } from "@/lib/db";
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

type PaymentSnapshot = {
  payment: { amount: number; planned_date: string | null };
  capital_call: {
    fund_name: string;
    gp_name: string;
    call_no: number;
    call_date: string;
    due_date: string;
    call_amount: number;
    purpose: string | null;
    data_source: "gp_api" | "manual";
    paid_amount: number;
    pending_amount: number;
  };
};

// 결재 상세 (R2-4 선정, R4-2 납입). 결재 화면은 기안 시점 스냅샷을 보여준다 (BR-APR-04) — 무엇을 결재하는지가 바뀌지 않게
export default async function ApprovalDetailPage(props: PageProps<"/approvals/[approvalId]">) {
  const { approvalId } = await props.params;
  const me = (await getCurrentUser())!;
  const a = await loadOrNotFound(() => getApproval(me.org_id, approvalId));
  const canDecide = a.status === "pending" && (me.role === "approver" || me.role === "admin") && a.requested_by !== me.id;
  if (a.target_type === "payment") return <PaymentApproval a={a} me={me} canDecide={canDecide} />;
  if (a.target_type === "vote") return <VoteApproval a={a} me={me} canDecide={canDecide} />;
  const s = a.snapshot as SelectionSnapshot;
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

// 납입 결재 (R4-2): 기안 시점의 캐피탈콜·납입 스냅샷. 승인하면 송금 대기, 반려하면 끝 (BR-PAY-01)
async function PaymentApproval({ a, me, canDecide }: { a: Awaited<ReturnType<typeof getApproval>>; me: { id: string }; canDecide: boolean }) {
  const s = a.snapshot as PaymentSnapshot;
  const cc = s.capital_call;
  const [payment] = await sql<{ capital_call_id: string; status: string }[]>`select capital_call_id, status from payments where id = ${a.target_id}`;
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
  const after = cc.paid_amount + cc.pending_amount + s.payment.amount;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/approvals" className="text-sm text-slate-500 hover:text-slate-700">
          ← 결재함
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">
            [{APPROVAL_TARGET_LABEL[a.target_type]}] {cc.fund_name} · {cc.call_no}회 {formatKRW(s.payment.amount)}
          </h1>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${APPROVAL_STATUS_STYLE[a.status]}`}>{APPROVAL_STATUS_LABEL[a.status]}</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          기안 {a.requested_by_name} · {formatDateTime(a.requested_at)}
          {a.request_comment && ` — ${a.request_comment}`}
          {payment && (
            <>
              {" "}
              ·{" "}
              <Link href={`/capital-calls/${payment.capital_call_id}`} className="text-emerald-700 hover:underline">
                캐피탈콜 보기
              </Link>
            </>
          )}
        </p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-3">
        <h2 className="py-2 text-sm font-semibold text-slate-900">납입 내용 (기안 시점)</h2>
        <dl>
          {row("운용사 · 조합", `${cc.gp_name} · ${cc.fund_name}`)}
          {row("캐피탈콜", `${cc.call_no}회 · 요청일 ${formatDate(cc.call_date)} · 기한 ${formatDate(cc.due_date)}${cc.data_source === "gp_api" ? " · GP 연동" : " · 수기"}`)}
          {cc.purpose && row("목적", cc.purpose)}
          {row("요청액", formatKRW(cc.call_amount))}
          {row("이미 송금 · 진행 중", `${formatKRW(cc.paid_amount)} · ${formatKRW(cc.pending_amount)}`)}
          {row("이번 납입", <span className="text-emerald-700">{formatKRW(s.payment.amount)}</span>)}
          {row("이번 납입 후 남는 요청액", formatKRW(cc.call_amount - after))}
          {row("송금 예정일", s.payment.planned_date ? formatDate(s.payment.planned_date) : "-")}
        </dl>
      </section>
      <p className="text-xs text-slate-500">승인하면 “송금 대기”가 되고, 출자 담당이 실제 송금 뒤 송금 완료를 기록합니다. 승인됐다고 돈이 나간 것은 아닙니다 (03 DB 설계 payments).</p>
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

type VoteSnapshot = {
  meeting: { fund_name: string; gp_name: string; meeting_type: string; meeting_date: string; location: string | null; data_source: "gp_api" | "manual" };
  votes: { agenda_id: string; agenda_no: number; agenda_type: string; title: string; choice: string; review_opinion: string | null }[];
};

// 투표 결재 (R5-3): 기안 시점의 안건·찬반·검토 의견. 승인되면 연동 총회는 GP에 바로 제출 (BR-VOTE-04)
function VoteApproval({ a, me, canDecide }: { a: Awaited<ReturnType<typeof getApproval>>; me: { id: string }; canDecide: boolean }) {
  const s = a.snapshot as VoteSnapshot;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/approvals" className="text-sm text-slate-500 hover:text-slate-700">
          ← 결재함
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">
            [{APPROVAL_TARGET_LABEL[a.target_type]}] {s.meeting.fund_name} · {MEETING_TYPE_LABEL[s.meeting.meeting_type] ?? s.meeting.meeting_type}
          </h1>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${APPROVAL_STATUS_STYLE[a.status]}`}>{APPROVAL_STATUS_LABEL[a.status]}</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          기안 {a.requested_by_name} · {formatDateTime(a.requested_at)}
          {a.request_comment && ` — ${a.request_comment}`} · 총회일 {formatDate(s.meeting.meeting_date)} ·{" "}
          <Link href={`/meetings/${a.target_id}`} className="text-emerald-700 hover:underline">
            총회 보기
          </Link>
        </p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">안건별 찬반 (기안 시점)</h2>
        <ol className="divide-y divide-slate-100">
          {s.votes.map((v) => (
            <li key={v.agenda_id} className="px-5 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-slate-900">
                  제{v.agenda_no}호 · {v.title}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${v.choice === "for" ? "bg-emerald-100 text-emerald-700" : v.choice === "against" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
                  {VOTE_CHOICE_LABEL[v.choice]}
                </span>
              </div>
              {v.review_opinion && <p className="mt-1 text-slate-600">검토 의견: {v.review_opinion}</p>}
            </li>
          ))}
        </ol>
      </section>
      <p className="text-xs text-slate-500">
        {s.meeting.data_source === "gp_api" ? "승인하면 GP에 바로 투표가 제출됩니다. 검토 의견은 GP에 보내지 않습니다 (BR-VOTE-03·04)." : "수기 총회라 승인 뒤 서면으로 내고 \"서면 제출 완료\"를 기록합니다."}
      </p>
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
