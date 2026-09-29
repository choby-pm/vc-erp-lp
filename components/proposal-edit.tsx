"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";

// 제안 수정: 요청 출자액 · 접수일 · 메모 (결정 전, 결재 대기 아닐 때, 수기 제안만 — BR-PROP-04, BR-COM-05)
export default function ProposalEdit({ proposalId, requestedAmount, receivedDate, memo }: { proposalId: string; requestedAmount: number; receivedDate: string; memo: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ requested: String(requestedAmount), received: receivedDate, memo: memo ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-emerald-700 hover:underline">
        요청액·메모 수정
      </button>
    );
  }
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">요청 출자액</span>
          <AmountInput value={v.requested} onChange={(x) => setV({ ...v, requested: x })} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">접수일</span>
          <input type="date" value={v.received} onChange={(e) => setV({ ...v, received: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">내부 메모</span>
          <input value={v.memo} onChange={(e) => setV({ ...v, memo: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700">
          취소
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            const res = await fetch(`/api/v1/proposals/${proposalId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ requested_amount: toAmount(v.requested), received_date: v.received, memo: v.memo }),
            });
            const data = await res.json().catch(() => ({}));
            setPending(false);
            if (!res.ok) {
              setError(data.error?.message ?? "저장하지 못했습니다");
              return;
            }
            setOpen(false);
            router.refresh();
          }}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          저장
        </button>
      </div>
    </div>
  );
}
