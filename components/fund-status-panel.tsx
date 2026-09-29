"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { FUND_STATUSES, FUND_STATUS_LABEL, type FundStatus } from "@/lib/labels";

// 수기 조합 상태 변경 (BR-FUND-02). 앞으로만 가고, 결성 완료 이후로 처음 갈 때 결성일·결성액을 받는다

const FORMED_OR_LATER: FundStatus[] = ["formed", "operating", "dissolved", "liquidated"];

export default function FundStatusPanel({ fundId, status, hasFormation }: { fundId: string; status: FundStatus; hasFormation: boolean }) {
  const router = useRouter();
  const next = FUND_STATUSES.slice(FUND_STATUSES.indexOf(status) + 1);
  const [target, setTarget] = useState<FundStatus | "">(next[0] ?? "");
  const [formationDate, setFormationDate] = useState("");
  const [fundSize, setFundSize] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (next.length === 0) return null;
  const needsFormation = target !== "" && FORMED_OR_LATER.includes(target) && !hasFormation;

  async function submit() {
    setPending(true);
    setErrors({});
    setMessage(null);
    const res = await fetch(`/api/v1/funds/${fundId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: target,
        ...(needsFormation ? { formation_date: formationDate || null, fund_size_amount: toAmount(fundSize) } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (res.ok) {
      router.refresh();
      return;
    }
    setErrors(data.error?.details?.fields ?? {});
    setMessage(data.error?.message ?? "바꾸지 못했습니다");
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">상태 바꾸기</h2>
      <p className="mt-1 text-xs text-slate-500">수기 조합은 GP에서 받은 소식대로 직접 바꿉니다. 상태는 앞으로만 바뀝니다.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">바꿀 상태</span>
          <select value={target} onChange={(e) => setTarget(e.target.value as FundStatus)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {next.map((s) => (
              <option key={s} value={s}>
                {FUND_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {needsFormation && (
          <>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">결성일</span>
              <input
                type="date"
                value={formationDate}
                onChange={(e) => setFormationDate(e.target.value)}
                className={`mt-1 block rounded-lg border px-3 py-2 text-sm ${errors.formation_date ? "border-red-400" : "border-slate-300"}`}
              />
            </label>
            <label className="block w-56">
              <span className="text-xs font-medium text-slate-600">결성액 (조합 전체 약정 총액)</span>
              <AmountInput value={fundSize} onChange={setFundSize} invalid={!!errors.fund_size_amount} placeholder="원 단위" />
            </label>
          </>
        )}
        <button type="button" onClick={submit} disabled={pending || target === ""} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
          {pending ? "바꾸는 중…" : "바꾸기"}
        </button>
      </div>
      {message && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
          {Object.values(errors).length > 0 && ` (${Object.values(errors).join(", ")})`}
        </p>
      )}
    </section>
  );
}
