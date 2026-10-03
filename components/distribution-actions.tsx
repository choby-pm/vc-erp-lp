"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";

// 분배 수령 기록 · 정정 · 수기 분배 (R6-1, BR-DIST-02·03·05, L39)
// 수령 기록·정정은 돈이 걸린 요청이라 Idempotency-Key 로 두 번 눌러도 한 번만 처리된다

async function post(url: string, body: unknown, key?: { current: string }) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key.current } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (key) key.current = crypto.randomUUID();
    const fields = data.error?.details?.fields as Record<string, string> | undefined;
    throw new Error(fields ? Object.values(fields).join(" · ") : (data.error?.message ?? "처리하지 못했습니다"));
  }
  return data.data;
}

export function DistributionRowActions({ id, status, canCorrect }: { id: string; status: "announced" | "received"; canCorrect: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "receive" | "correct">("none");
  const [v, setV] = useState({ date: "", reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const key = useRef(crypto.randomUUID());

  if (mode === "none") {
    return status === "announced" ? (
      <button type="button" onClick={() => setMode("receive")} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
        수령 기록
      </button>
    ) : canCorrect ? (
      <button type="button" onClick={() => setMode("correct")} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
        수령 기록 정정
      </button>
    ) : null;
  }
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left">
      {mode === "receive" ? (
        <label className="block text-xs text-slate-600">
          수령일 (통장에 들어온 날)
          <input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
      ) : (
        <label className="block text-xs text-slate-600">
          정정 사유 — 장부에 수령일 날짜로 취소 행이 남고 수령 대기로 돌아갑니다
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
          onClick={async () => {
            setPending(true);
            setError(null);
            try {
              if (mode === "receive") await post(`/api/v1/distributions/${id}/receive`, { received_date: v.date }, key);
              else await post(`/api/v1/distributions/${id}/cancel-receipt`, { reason: v.reason }, key);
              key.current = crypto.randomUUID();
              setMode("none");
              router.refresh();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setPending(false);
            }
          }}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60 ${mode === "receive" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}
        >
          {mode === "receive" ? "기록" : "정정"}
        </button>
      </div>
    </div>
  );
}

export function NewDistributionForm({ commitmentId, nextNo }: { commitmentId: string; nextNo: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ date: "", roc: "", profit: "", final: false });
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-emerald-700 hover:underline">
        + 분배 입력
      </button>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs text-slate-600">수기 조합이라 GP가 알려 준 분배를 직접 입력합니다 ({nextNo}회). 금액 = 원금 반환 + 수익.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-slate-600">
          분배일
          <input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          원금 반환
          <AmountInput value={v.roc} onChange={(x) => setV({ ...v, roc: x })} />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          수익
          <AmountInput value={v.profit} onChange={(x) => setV({ ...v, profit: x })} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={v.final} onChange={(e) => setV({ ...v, final: e.target.checked })} />
        최종 분배 (청산 때)
      </label>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
          취소
        </button>
        <button
          type="button"
          onClick={async () => {
            setError(null);
            try {
              await post(`/api/v1/commitments/${commitmentId}/distributions`, {
                distribution_date: v.date,
                return_of_capital_amount: toAmount(v.roc) ?? 0,
                profit_amount: toAmount(v.profit) ?? 0,
                is_final: v.final,
              });
              setOpen(false);
              router.refresh();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          등록
        </button>
      </div>
    </div>
  );
}
