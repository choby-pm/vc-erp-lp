"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STRATEGIES, STRATEGY_LABEL, type Strategy } from "@/lib/labels";

// 연동 조합의 분야 수정 (R3-5). 분야는 GP에 없는 LP 쪽 분류라 담당자가 고른다. 바꾸면 바로 저장한다
export default function FundStrategyEdit({ fundId, strategy }: { fundId: string; strategy: Strategy }) {
  const router = useRouter();
  const [value, setValue] = useState(strategy);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: Strategy) {
    const prev = value;
    setValue(next);
    setPending(true);
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategy: next }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setValue(prev);
      setError(body.error?.message ?? "저장하지 못했습니다");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <select
        aria-label="분야"
        value={value}
        disabled={pending}
        onChange={(e) => save(e.target.value as Strategy)}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-60"
      >
        {STRATEGIES.map((s) => (
          <option key={s} value={s}>
            {STRATEGY_LABEL[s]}
          </option>
        ))}
      </select>
      {error && <span role="alert" className="text-xs text-rose-600">{error}</span>}
    </span>
  );
}
