"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatDate, formatDateTime, formatKRW, formatPercent, percentToRatio, ratioToPercent } from "@/lib/format";
import { APPROVAL_STATUS_LABEL, APPROVAL_STATUS_STYLE, type ApprovalStatus } from "@/lib/labels";

// 선정 조건 → 선정 점검 → 선정 결재 기안 (R2-4, BR-SEL-01·02, BR-APR-01~04)

type Terms = {
  budget_id: string;
  budget_year: number;
  planned_amount: number;
  max_commitment_ratio: number | null;
  formation_deadline: string;
  key_person_condition: string | null;
  locked_at: Date | string | null;
} | null;
type Check = { rule: string; label: string; ok: boolean; message?: string };
type Approval = { id: string; status: ApprovalStatus; requested_by_name: string; requested_at: Date | string; request_comment: string | null; approver_name: string | null; decided_at: Date | string | null; decision_comment: string | null };

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export default function SelectionPanel({
  proposalId,
  requestedAmount,
  budgets,
  fixedBudgetId,
  defaultMaxRatio,
  terms,
  check,
  approvals,
  editable,
  canRequest,
}: {
  proposalId: string;
  requestedAmount: number;
  budgets: { id: string; budget_year: number }[];
  fixedBudgetId: string | null;
  defaultMaxRatio: number | null;
  terms: Terms;
  check: { can_request: boolean; checks: Check[]; warnings: string[] };
  approvals: Approval[];
  editable: boolean;
  canRequest: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!terms && editable);
  const [v, setV] = useState({
    budget_id: terms?.budget_id ?? fixedBudgetId ?? budgets[0]?.id ?? "",
    planned_amount: String(terms?.planned_amount ?? requestedAmount),
    max_commitment_ratio: terms ? (terms.max_commitment_ratio === null ? "" : String(ratioToPercent(terms.max_commitment_ratio))) : defaultMaxRatio === null ? "" : String(ratioToPercent(defaultMaxRatio)),
    formation_deadline: terms?.formation_deadline ?? "",
    key_person_condition: terms?.key_person_condition ?? "",
  });
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function send(url: string, method: string, body: unknown) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fields = data.error?.details?.fields as Record<string, string> | undefined;
        throw new Error(fields ? Object.values(fields).join(", ") : (data.error?.message ?? "처리하지 못했습니다"));
      }
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setPending(false);
    }
  }

  const locked = Boolean(terms?.locked_at);
  const hasPending = approvals.some((a) => a.status === "pending");

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">선정 조건 · 선정 결재</h2>
        {locked && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">결재 승인 · 잠김</span>}
        {!locked && editable && terms && !open && !hasPending && (
          <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-emerald-700 hover:underline">
            선정 조건 수정
          </button>
        )}
      </div>

      {open ? (
        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">예산 연도</span>
              <select value={v.budget_id} disabled={Boolean(fixedBudgetId)} onChange={(e) => setV({ ...v, budget_id: e.target.value })} className={`${inputClass} disabled:bg-slate-50`}>
                {budgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.budget_year}년 예산
                  </option>
                ))}
              </select>
              {fixedBudgetId && <p className="mt-1 text-xs text-slate-500">공고형은 출자사업의 예산으로 고정</p>}
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">출자 예정액 (확약 금액)</span>
              <AmountInput value={v.planned_amount} onChange={(x) => setV({ ...v, planned_amount: x })} />
              <p className="mt-1 text-xs text-slate-500">요청 출자액 {formatKRW(requestedAmount)} 이하</p>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">결성 기한</span>
              <input type="date" value={v.formation_deadline} onChange={(e) => setV({ ...v, formation_deadline: e.target.value })} className={inputClass} />
              <p className="mt-1 text-xs text-slate-500">이날까지 결성되지 않으면 선정 취소 대상</p>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">출자 비율 상한 % (선택)</span>
              <input inputMode="decimal" value={v.max_commitment_ratio} onChange={(e) => setV({ ...v, max_commitment_ratio: e.target.value.replace(/[^0-9.]/g, "") })} className={`${inputClass} text-right`} />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">핵심 운용 인력 조건 (선택)</span>
              <input value={v.key_person_condition} onChange={(e) => setV({ ...v, key_person_condition: e.target.value })} placeholder="예: 대표펀드매니저 김○○ 존속 기간 중 유지" className={inputClass} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            {terms && (
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700">
                취소
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={async () => {
                const done = await send(`/api/v1/proposals/${proposalId}/selection-terms`, "PUT", {
                  budget_id: v.budget_id,
                  planned_amount: toAmount(v.planned_amount),
                  max_commitment_ratio: v.max_commitment_ratio === "" ? null : percentToRatio(Number(v.max_commitment_ratio)),
                  formation_deadline: v.formation_deadline,
                  key_person_condition: v.key_person_condition,
                });
                // 새 데이터가 도착한 뒤에 닫는다 (먼저 닫으면 잠깐 "선정 조건 없음"이 보인다)
                if (done) startTransition(() => {
                  router.refresh();
                  setOpen(false);
                });
              }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {pending ? "저장하는 중…" : "선정 조건 저장"}
            </button>
          </div>
        </div>
      ) : terms ? (
        <dl className="grid gap-x-8 px-5 py-4 text-sm sm:grid-cols-2">
          {[
            ["예산", `${terms.budget_year}년`],
            ["출자 예정액", formatKRW(terms.planned_amount)],
            ["결성 기한", formatDate(terms.formation_deadline)],
            ["출자 비율 상한", terms.max_commitment_ratio === null ? "없음" : formatPercent(terms.max_commitment_ratio)],
            ["핵심 운용 인력 조건", terms.key_person_condition ?? "없음"],
          ].map(([k, val]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-slate-100 py-2">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-right font-medium text-slate-900">{val}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="px-5 py-6 text-sm text-slate-500">아직 선정 조건이 없습니다.</p>
      )}

      {!locked && !open && (
        <div className="border-t border-slate-200 px-5 py-4">
          <p className="text-xs font-semibold text-slate-600">선정 결재 점검</p>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {check.checks.map((c, i) => (
              <li key={i} className={c.ok ? "text-slate-700" : "text-red-700"}>
                {c.ok ? "✓" : "✗"} {c.label}
                {c.message && <span className="text-xs text-slate-500"> — {c.message}</span>}
              </li>
            ))}
          </ul>
          {check.warnings.map((w) => (
            <p key={w} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠ {w}
            </p>
          ))}
          {canRequest && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block min-w-64 flex-1">
                <span className="text-xs font-medium text-slate-600">기안 의견</span>
                <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="예: 투자심의위원회 통과, 예산 잔액 충분" className={inputClass} />
              </label>
              <button
                type="button"
                disabled={pending || !check.can_request}
                onClick={async () => {
                  if (await send(`/api/v1/proposals/${proposalId}/selection-approvals`, "POST", { request_comment: comment })) {
                    setComment("");
                    router.refresh();
                  }
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {pending ? "올리는 중…" : "선정 결재 올리기"}
              </button>
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="mx-5 mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {approvals.length > 0 && (
        <div className="border-t border-slate-200">
          <p className="px-5 pt-3 text-xs font-semibold text-slate-600">결재 이력</p>
          <ul className="divide-y divide-slate-100">
            {approvals.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-2.5 text-sm">
                <span>
                  <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${APPROVAL_STATUS_STYLE[a.status]}`}>{APPROVAL_STATUS_LABEL[a.status]}</span>
                  <Link href={`/approvals/${a.id}`} className="text-slate-800 hover:text-emerald-700">
                    기안 {a.requested_by_name}
                    {a.request_comment && <span className="text-slate-500"> — {a.request_comment}</span>}
                  </Link>
                  {a.decision_comment && (
                    <span className="block text-xs text-slate-500">
                      {a.approver_name}: {a.decision_comment}
                    </span>
                  )}
                </span>
                <span className="text-xs text-slate-500">{formatDateTime(a.decided_at ?? a.requested_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
