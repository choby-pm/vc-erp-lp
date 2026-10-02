"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import type { FormationCheck } from "@/lib/services/commitments";

// 결성 확인 · 선정 취소 (R3-6, BR-CMT-02~05)
// · 연동: GP 값으로 만든 확인표를 보여주고 "결성 확인" (본문 없음)
// · 수기: 약정액·결성액·결성일을 입력하면 확인표를 다시 계산해 보여준다 (L25)
// 결성 확인은 돈이 걸린 요청이라 Idempotency-Key 로 두 번 눌러도 한 번만 처리된다

function CheckTable({ check }: { check: FormationCheck }) {
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
      {check.checks.map((c, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
          <span className="flex items-baseline gap-2">
            <span
              aria-label={c.ok === true ? "통과" : c.ok === false ? "미달" : "해당 없음"}
              className={`inline-block w-5 text-center font-bold ${c.ok === true ? "text-emerald-600" : c.ok === false ? "text-rose-600" : "text-slate-300"}`}
            >
              {c.ok === true ? "✓" : c.ok === false ? "✕" : "–"}
            </span>
            <span className="text-slate-800">{c.label}</span>
          </span>
          <span className={`text-right text-xs ${c.ok === false ? "text-rose-700" : "text-slate-500"}`}>{c.message}</span>
        </li>
      ))}
    </ul>
  );
}

export default function CommitmentActions({
  commitmentId,
  linked,
  canWrite,
  initialCheck,
  fundFormation,
}: {
  commitmentId: string;
  linked: boolean;
  canWrite: boolean;
  initialCheck: FormationCheck;
  fundFormation: { fund_size_amount: number | null; formation_date: string | null };
}) {
  const router = useRouter();
  const [check, setCheck] = useState(initialCheck);
  const [v, setV] = useState({
    amount: "",
    size: fundFormation.fund_size_amount ? String(fundFormation.fund_size_amount) : "",
    date: fundFormation.formation_date ?? "",
  });
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"confirm" | "cancel">("confirm");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const key = useRef(crypto.randomUUID());

  // 수기: 입력이 바뀌면 확인표를 다시 계산 (저장하지 않음)
  useEffect(() => {
    if (linked) return;
    const q = new URLSearchParams();
    const amount = toAmount(v.amount);
    const size = toAmount(v.size);
    if (amount) q.set("commitment_amount", String(amount));
    if (size) q.set("fund_size_amount", String(size));
    if (v.date) q.set("formation_date", v.date);
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/v1/commitments/${commitmentId}/formation-check?${q}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok) setCheck(body.data);
    }, 300);
    return () => clearTimeout(timer);
  }, [linked, commitmentId, v]);

  async function confirm() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/v1/commitments/${commitmentId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key.current },
      body: JSON.stringify(linked ? {} : { commitment_amount: toAmount(v.amount), fund_size_amount: toAmount(v.size), formation_date: v.date }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      key.current = crypto.randomUUID(); // 실패는 저장되지 않으므로 새 키로 다시 보낸다
      if (body.error?.details?.checks) setCheck((c) => ({ ...c, checks: body.error.details.checks }));
      const fields = body.error?.details?.fields as Record<string, string> | undefined;
      setError(fields ? Object.values(fields).join(" · ") : (body.error?.message ?? "결성 확인하지 못했습니다"));
      return;
    }
    router.refresh();
  }

  async function cancel() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/v1/commitments/${commitmentId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) return setError(body.error?.details?.fields?.reason ?? body.error?.message ?? "취소하지 못했습니다");
    router.refresh();
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">결성 확인표</h2>
        {canWrite && (
          <div role="tablist" className="inline-flex rounded-lg bg-slate-100 p-1">
            {(["confirm", "cancel"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {m === "confirm" ? "결성 확인" : "선정 취소"}
              </button>
            ))}
          </div>
        )}
      </div>

      {mode === "confirm" && (
        <>
          {!linked && canWrite && (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">약정액</span>
                <AmountInput value={v.amount} onChange={(x) => setV({ ...v, amount: x })} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">결성액</span>
                <AmountInput value={v.size} onChange={(x) => setV({ ...v, size: x })} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">결성일</span>
                <input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
            </div>
          )}
          {linked && <p className="text-xs text-slate-500">연동 조합은 GP 값으로 확인합니다: 약정액 = GP 원장 사본의 약정 합계, 결성일·결성액 = GP 조합 정보. 확인 직전에 GP와 다시 맞춥니다.</p>}
          <CheckTable check={check} />
          {canWrite && (
            <div className="flex items-center justify-end gap-3">
              {!check.ok && <span className="text-xs text-slate-500">모든 조건을 채워야 확인할 수 있습니다</span>}
              <button
                type="button"
                onClick={confirm}
                disabled={pending || !check.ok}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {pending ? "확인 중…" : "결성 확인"}
              </button>
            </div>
          )}
        </>
      )}

      {mode === "cancel" && canWrite && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            조합이 결성되지 않았거나 출자를 하지 않기로 했을 때 선정을 취소합니다. 출자 예정액은 예산 사용액에서 빠집니다. 연동 조합이어도 GP에는 알리지 않으니 GP 담당자에게 따로 알리세요.
          </p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="취소 사유 (필수)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex justify-end">
            <button type="button" onClick={cancel} disabled={pending} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
              {pending ? "처리 중…" : "선정 취소"}
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
