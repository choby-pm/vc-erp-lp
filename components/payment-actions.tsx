"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatKRW } from "@/lib/format";

// 납입 기안 · 송금 완료 기록 · 취소/정정 (R4-2, BR-PAY-01~05)
// 돈이 걸린 요청은 Idempotency-Key 로 두 번 눌러도 한 번만 처리된다. 실패하면 새 키로 다시 보낸다

async function post(url: string, body: unknown, key: { current: string }) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key.current }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    key.current = crypto.randomUUID();
    const fields = data.error?.details?.fields as Record<string, string> | undefined;
    throw new Error(fields ? Object.values(fields).join(" · ") : (data.error?.message ?? "처리하지 못했습니다"));
  }
  return data.data;
}

export function NewPaymentForm({ callId, left }: { callId: string; left: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ amount: left > 0 ? String(left) : "", planned: "", comment: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const key = useRef(crypto.randomUUID());

  if (!open) {
    return (
      <button type="button" disabled={left <= 0} onClick={() => setOpen(true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
        납입 기안
      </button>
    );
  }
  return (
    <div className="w-full space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs text-slate-600">기안하면 결재권자에게 결재가 올라갑니다. 나눠 낼 수 있습니다 (지금 {formatKRW(left)}까지).</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">납입액</span>
          <AmountInput value={v.amount} onChange={(x) => setV({ ...v, amount: x })} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">송금 예정일 (선택)</span>
          <input type="date" value={v.planned} onChange={(e) => setV({ ...v, planned: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">기안 의견 (선택)</span>
          <input value={v.comment} onChange={(e) => setV({ ...v, comment: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
          닫기
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            try {
              await post(`/api/v1/capital-calls/${callId}/payments`, { amount: toAmount(v.amount), planned_date: v.planned || null, request_comment: v.comment }, key);
              setOpen(false);
              key.current = crypto.randomUUID();
              router.refresh();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setPending(false);
            }
          }}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          결재 올리기
        </button>
      </div>
    </div>
  );
}

// 송금 대기 → 송금 완료 기록 / 취소. 송금 완료 → 정정
export function PaymentRowActions({ paymentId, status }: { paymentId: string; status: "approved" | "paid" }) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "paid" | "cancel">("none");
  const [v, setV] = useState({ date: "", ref: "", reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const key = useRef(crypto.randomUUID());

  const run = async (url: string, body: unknown) => {
    setPending(true);
    setError(null);
    try {
      await post(url, body, key);
      setMode("none");
      key.current = crypto.randomUUID();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  if (mode === "none") {
    return (
      <span className="inline-flex gap-2">
        {status === "approved" && (
          <button type="button" onClick={() => setMode("paid")} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
            송금 완료 기록
          </button>
        )}
        <button type="button" onClick={() => setMode("cancel")} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
          {status === "paid" ? "송금 기록 정정" : "취소"}
        </button>
      </span>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left">
      {mode === "paid" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs text-slate-600">
            송금일
            <input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="block text-xs text-slate-600">
            이체 번호 (선택)
            <input value={v.ref} onChange={(e) => setV({ ...v, ref: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
        </div>
      ) : (
        <label className="block text-xs text-slate-600">
          {status === "paid" ? "정정 사유 — 장부에 송금일 날짜로 취소 행이 남습니다" : "취소 사유"}
          <input value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
      )}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setMode("none")} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700">
          닫기
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            mode === "paid"
              ? run(`/api/v1/payments/${paymentId}/mark-paid`, { paid_date: v.date, bank_reference: v.ref })
              : run(`/api/v1/payments/${paymentId}/cancel`, { reason: v.reason })
          }
          className={`rounded-md px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60 ${mode === "paid" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}
        >
          {mode === "paid" ? "기록" : status === "paid" ? "정정" : "취소"}
        </button>
      </div>
    </div>
  );
}
