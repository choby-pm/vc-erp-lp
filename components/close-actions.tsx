"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { CloseCheck } from "@/lib/services/closing";

// 청산 확인 (R6-4, BR-CLOSE-01·02): 조건표를 보여주고, 모두 통과하면 청산일을 골라 확인한다
// 확인하면 최종 성과를 고정하고 출자 건을 잠근다 (되돌릴 수 없음). Idempotency-Key 로 두 번 눌러도 한 번만 처리
export default function CloseActions({ commitmentId, initialCheck, canWrite, today }: { commitmentId: string; initialCheck: CloseCheck; canWrite: boolean; today: string }) {
  const router = useRouter();
  const [check, setCheck] = useState(initialCheck);
  const [date, setDate] = useState(today);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const key = useRef(crypto.randomUUID());

  async function close() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/v1/commitments/${commitmentId}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key.current },
      body: JSON.stringify({ closed_date: date }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      key.current = crypto.randomUUID();
      if (body.error?.details?.checks) setCheck((c) => ({ ok: false, checks: body.error.details.checks ?? c.checks }));
      const fields = body.error?.details?.fields as Record<string, string> | undefined;
      return setError(fields ? Object.values(fields).join(" · ") : (body.error?.message ?? "청산 확인하지 못했습니다"));
    }
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">
        청산 확인 <span className="font-normal text-slate-500">· 조건을 모두 채우면 최종 성과를 고정하고 출자 건을 잠급니다</span>
      </h2>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {check.checks.map((c) => (
          <li key={c.label} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
            <span className="flex items-baseline gap-2">
              <span aria-label={c.ok ? "통과" : "미달"} className={`inline-block w-5 text-center font-bold ${c.ok ? "text-emerald-600" : "text-rose-600"}`}>
                {c.ok ? "✓" : "✕"}
              </span>
              <span className="text-slate-800">{c.label}</span>
            </span>
            <span className={`text-right text-xs ${c.ok ? "text-slate-500" : "text-rose-700"}`}>{c.message}</span>
          </li>
        ))}
      </ul>
      {canWrite && check.ok && !open && (
        <button onClick={() => setOpen(true)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          청산 확인…
        </button>
      )}
      {canWrite && check.ok && open && (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p>청산 확인하면 되돌릴 수 없습니다. 이후 납입·분배·약정 변경·보고 기록을 더하지 않고, 청산일 기준 최종 성과(평가액 0)가 고정됩니다.</p>
          <label className="flex items-center gap-2">
            청산일
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1" />
          </label>
          <div className="flex gap-2">
            <button disabled={pending} onClick={close} className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-50">
              {pending ? "처리 중…" : "청산 확인"}
            </button>
            <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50">
              닫기
            </button>
          </div>
        </div>
      )}
      {!check.ok && <p className="text-xs text-slate-500">조건을 모두 채우면 청산 확인 버튼이 나타납니다.</p>}
      {error && <p className="text-sm text-rose-700">{error}</p>}
    </section>
  );
}
