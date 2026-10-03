"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatKRW } from "@/lib/format";

// 수기 캐피탈콜 등록 · 취소 (R4-1, BR-CALL-02~04)

export function NewCallForm({ commitmentId, nextNo, unfunded }: { commitmentId: string; nextNo: number; unfunded: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ callDate: "", dueDate: "", amount: "", purpose: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-emerald-700 hover:underline">
        + 캐피탈콜 입력
      </button>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs text-slate-600">
        수기 조합이라 GP에서 받은 캐피탈콜을 직접 입력합니다. {nextNo}회 · 남은 약정 {formatKRW(unfunded)} 이내
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        {(
          [
            ["callDate", "요청일", "call_date"],
            ["dueDate", "납입 기한", "due_date"],
          ] as const
        ).map(([k, label, field]) => (
          <label key={k} className="block">
            <span className="text-xs font-medium text-slate-600">{label}</span>
            <input type="date" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            {errors[field] && <span className="text-xs text-rose-600">{errors[field]}</span>}
          </label>
        ))}
        <label className="block">
          <span className="text-xs font-medium text-slate-600">요청액</span>
          <AmountInput value={v.amount} onChange={(x) => setV({ ...v, amount: x })} />
          {errors.call_amount && <span className="text-xs text-rose-600">{errors.call_amount}</span>}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">목적 (선택)</span>
          <input value={v.purpose} onChange={(e) => setV({ ...v, purpose: e.target.value })} placeholder="예: 최초 납입" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </div>
      {message && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
          취소
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setErrors({});
            setMessage(null);
            const res = await fetch(`/api/v1/commitments/${commitmentId}/capital-calls`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ call_date: v.callDate, due_date: v.dueDate, call_amount: toAmount(v.amount), purpose: v.purpose }),
            });
            const body = await res.json().catch(() => ({}));
            setPending(false);
            if (!res.ok) {
              setErrors(body.error?.details?.fields ?? {});
              setMessage(body.error?.message ?? "등록하지 못했습니다");
              return;
            }
            setOpen(false);
            setV({ callDate: "", dueDate: "", amount: "", purpose: "" });
            router.refresh();
          }}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          등록
        </button>
      </div>
    </div>
  );
}

export function CancelCallButton({ callId }: { callId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          if (!confirm("이 캐피탈콜을 취소할까요? 결재 대기·송금 대기 납입도 함께 취소됩니다.")) return;
          setPending(true);
          setError(null);
          const res = await fetch(`/api/v1/capital-calls/${callId}/cancel`, { method: "POST" });
          const body = await res.json().catch(() => ({}));
          setPending(false);
          if (!res.ok) return setError(body.error?.message ?? "취소하지 못했습니다");
          router.refresh();
        }}
        className="rounded-md border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60"
      >
        취소
      </button>
      {error && <span className="max-w-[12rem] text-right text-xs text-rose-600">{error}</span>}
    </span>
  );
}
