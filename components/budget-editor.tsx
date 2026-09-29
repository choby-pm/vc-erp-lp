"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatKRW } from "@/lib/format";
import { STRATEGIES, STRATEGY_LABEL, type Strategy } from "@/lib/labels";

// 예산 만들기 · 총액 수정 · 분야별 배분 편집 (R2-1, BR-BUD-01·02·06)

type ApiError = { error?: { message?: string; details?: { fields?: Record<string, string>; existing_budget_id?: string } } };

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as ApiError).error;
    const field = e?.details?.fields ? Object.values(e.details.fields)[0] : null;
    throw new Error(field ?? e?.message ?? "저장하지 못했습니다");
  }
  return (data as { data: { id: string } }).data;
}

export function BudgetCreateForm({ defaultYear }: { defaultYear: number }) {
  const router = useRouter();
  const [year, setYear] = useState(String(defaultYear));
  const [total, setTotal] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          const b = await send("/api/v1/budgets", "POST", { budget_year: Number(year), total_amount: toAmount(total) ?? 0, memo });
          router.push(`/budgets/${b.id}`);
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
          setPending(false);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">예산 연도</span>
          <input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-slate-700">예산 총액 (그해 새로 선정할 수 있는 금액)</span>
          <AmountInput value={total} onChange={setTotal} placeholder="원 단위" />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">메모 (선택)</span>
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 이사회 승인 2026-01-20" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
          {pending ? "만드는 중…" : "예산 만들기"}
        </button>
      </div>
    </form>
  );
}

export function BudgetTotalEditor({ budgetId, total, memo }: { budgetId: string; total: number; memo: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(total));
  const [text, setText] = useState(memo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
        총액 수정
      </button>
    );
  }
  return (
    <div className="w-full space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">예산 총액</span>
          <AmountInput value={value} onChange={setValue} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">메모</span>
          <input value={text} onChange={(e) => setText(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
          취소
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            try {
              await send(`/api/v1/budgets/${budgetId}`, "PATCH", { total_amount: toAmount(value) ?? 0, memo: text });
              setOpen(false);
              router.refresh();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setPending(false);
            }
          }}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          저장
        </button>
      </div>
    </div>
  );
}

export function AllocationEditor({
  budgetId,
  total,
  rows,
  canWrite,
}: {
  budgetId: string;
  total: number;
  rows: { strategy: Strategy; allocated_amount: number; used_amount: number }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<Strategy, string>>(
    Object.fromEntries(STRATEGIES.map((s) => [s, String(rows.find((r) => r.strategy === s)?.allocated_amount || "")])) as Record<Strategy, string>,
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const sum = STRATEGIES.reduce((s, k) => s + (toAmount(values[k]) ?? 0), 0);
  const over = sum > total;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">분야별 배분 · 사용</h2>
        <p className={`text-xs ${over ? "font-semibold text-red-600" : "text-slate-500"}`}>
          배분 합계 {formatKRW(sum)} / 총액 {formatKRW(total)}
          {over && " — 총액을 넘습니다"}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs font-semibold text-slate-500">
          <tr>
            <th className="px-5 py-2">분야</th>
            <th className="px-5 py-2">배분액</th>
            <th className="px-5 py-2 text-right">사용액 (선정 + 결재 대기)</th>
            <th className="px-5 py-2">배분 대비</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {STRATEGIES.map((s) => {
            const allocated = toAmount(values[s]) ?? 0;
            const used = rows.find((r) => r.strategy === s)?.used_amount ?? 0;
            const ratio = allocated > 0 ? used / allocated : used > 0 ? Infinity : 0;
            return (
              <tr key={s}>
                <td className="px-5 py-2.5 font-medium text-slate-900">{STRATEGY_LABEL[s]}</td>
                <td className="w-64 px-5 py-2">
                  {canWrite ? (
                    <AmountInput
                      value={values[s]}
                      onChange={(v) => {
                        setValues((prev) => ({ ...prev, [s]: v }));
                        setSaved(false);
                      }}
                      aria-label={`${STRATEGY_LABEL[s]} 배분액`}
                      placeholder="0"
                    />
                  ) : (
                    <span className="tabular-nums">{formatKRW(allocated)}</span>
                  )}
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums text-slate-700">{formatKRW(used)}</td>
                <td className="px-5 py-2.5">
                  {/* 배분을 넘어도 막지 않고 경고만 한다 (BR-BUD-05) */}
                  <div className="h-2 w-40 rounded-full bg-slate-100">
                    <div className={`h-2 rounded-full ${ratio > 1 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
                  </div>
                  {ratio > 1 && <p className="mt-1 text-xs text-amber-700">배분 초과 (경고만)</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {canWrite && (
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-3">
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-emerald-700">저장했습니다</p>}
          <button
            type="button"
            disabled={pending || over}
            onClick={async () => {
              setPending(true);
              setError(null);
              try {
                await send(`/api/v1/budgets/${budgetId}/allocations`, "PUT", {
                  allocations: STRATEGIES.map((s) => ({ strategy: s, amount: toAmount(values[s]) ?? 0 })),
                });
                setSaved(true);
                router.refresh();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setPending(false);
              }
            }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {pending ? "저장하는 중…" : "배분 저장"}
          </button>
        </div>
      )}
    </section>
  );
}
