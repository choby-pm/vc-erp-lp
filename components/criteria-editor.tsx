"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { percentToRatio, ratioToPercent } from "@/lib/format";

// 평가 항목 관리 (관리자, BR-EVAL-01). 사용 중 항목의 가중치 합계가 100%여야 평가할 수 있다

type Criterion = { id: string; name: string; weight_ratio: number; sort_order: number; retired_at: Date | string | null; used_count: number };

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fields = data.error?.details?.fields as Record<string, string> | undefined;
    throw new Error(fields ? Object.values(fields).join(", ") : (data.error?.message ?? "저장하지 못했습니다"));
  }
}

function Row({ c }: { c: Criterion }) {
  const router = useRouter();
  const [name, setName] = useState(c.name);
  const [weight, setWeight] = useState(String(ratioToPercent(c.weight_ratio)));
  const [error, setError] = useState<string | null>(null);
  const dirty = name !== c.name || Number(weight) !== ratioToPercent(c.weight_ratio);

  return (
    <tr>
      <td className="px-5 py-2">
        <input aria-label="항목명" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
      </td>
      <td className="w-36 px-5 py-2">
        <div className="relative">
          <input aria-label="가중치" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, ""))} className="w-full rounded-lg border border-slate-300 py-1.5 pl-3 pr-8 text-right text-sm tabular-nums" />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
        </div>
      </td>
      <td className="px-5 py-2 text-right text-xs text-slate-500">{c.used_count > 0 ? `평가 ${c.used_count}건에 사용` : "-"}</td>
      <td className="px-5 py-2 text-right">
        <span className="inline-flex items-center gap-3 text-xs font-medium">
          {error && <span className="text-red-600">{error}</span>}
          {dirty && (
            <button
              type="button"
              onClick={async () => {
                setError(null);
                try {
                  await send(`/api/v1/evaluation-criteria/${c.id}`, "PATCH", { name, weight_ratio: percentToRatio(Number(weight)), sort_order: c.sort_order });
                  router.refresh();
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
              className="text-emerald-700 hover:underline"
            >
              저장
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              if (!confirm(`'${c.name}' 항목을 은퇴시킬까요? 새 평가에는 쓰지 않고, 이미 쓴 평가표 점수는 남습니다.`)) return;
              try {
                await send(`/api/v1/evaluation-criteria/${c.id}/retire`, "POST");
                router.refresh();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
            className="text-rose-700 hover:underline"
          >
            은퇴
          </button>
        </span>
      </td>
    </tr>
  );
}

export default function CriteriaEditor({ criteria, weightSum }: { criteria: Criterion[]; weightSum: number }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);
  const active = criteria.filter((c) => !c.retired_at);
  const retired = criteria.filter((c) => c.retired_at);
  const ok = Math.abs(weightSum - 1) < 1e-9;

  return (
    <div className="space-y-6">
      <p className={`rounded-xl px-4 py-3 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
        사용 중인 항목의 가중치 합계 <b>{(weightSum * 100).toFixed(1)}%</b> {ok ? "— 평가할 수 있습니다" : "— 100%가 되어야 심사위원이 평가할 수 있습니다"}
      </p>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">사용 중인 항목</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-5 py-2">항목</th>
              <th className="px-5 py-2">가중치</th>
              <th className="px-5 py-2" />
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {active.map((c) => (
              <Row key={c.id} c={c} />
            ))}
            <tr className="bg-slate-50">
              <td className="px-5 py-2">
                <input aria-label="새 항목명" value={name} onChange={(e) => setName(e.target.value)} placeholder="새 항목 (예: 리스크 관리)" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm" />
              </td>
              <td className="px-5 py-2">
                <div className="relative">
                  <input aria-label="새 항목 가중치" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, ""))} className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-right text-sm" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                </div>
              </td>
              <td className="px-5 py-2 text-xs text-red-600">{error}</td>
              <td className="px-5 py-2 text-right">
                <button
                  type="button"
                  onClick={async () => {
                    setError(null);
                    try {
                      await send("/api/v1/evaluation-criteria", "POST", { name, weight_ratio: weight === "" ? null : percentToRatio(Number(weight)), sort_order: active.length });
                      setName("");
                      setWeight("");
                      router.refresh();
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                  className="text-xs font-semibold text-emerald-700 hover:underline"
                >
                  + 추가
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {retired.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-500">은퇴한 항목 (과거 평가표에만 남음)</h2>
          <ul className="divide-y divide-slate-100 text-sm text-slate-500">
            {retired.map((c) => (
              <li key={c.id} className="flex justify-between px-5 py-2">
                <span>{c.name}</span>
                <span>{c.used_count > 0 ? `평가 ${c.used_count}건` : "사용 안 함"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
