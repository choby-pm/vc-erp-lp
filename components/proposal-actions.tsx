"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PROPOSAL_STATUS_LABEL, REVIEW_STAGES, type ProposalStatus } from "@/lib/labels";

// 심사 단계 이동 · 탈락 · 철회 (R2-3, BR-PROP-04·05). 선정은 선정 결재로만 (R2-4)

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message ?? "처리하지 못했습니다");
}

export default function ProposalActions({ proposalId, status, isManual }: { proposalId: string; status: ProposalStatus; isManual: boolean }) {
  const router = useRouter();
  const idx = REVIEW_STAGES.indexOf(status as (typeof REVIEW_STAGES)[number]);
  const nextStages = REVIEW_STAGES.slice(idx + 1);
  const [to, setTo] = useState<string>(nextStages[0] ?? "");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"move" | "reject" | "withdraw">("move");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    setError(null);
    try {
      if (mode === "move") await post(`/api/v1/proposals/${proposalId}/stage`, { to_status: to, note });
      else await post(`/api/v1/proposals/${proposalId}/${mode}`, { note });
      setNote("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  const tab = (m: typeof mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => setMode(m)}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
    >
      {label}
    </button>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">심사 진행</h2>
        <div role="tablist" className="inline-flex rounded-lg bg-slate-100 p-1">
          {nextStages.length > 0 && tab("move", "다음 단계로")}
          {tab("reject", "탈락")}
          {isManual && tab("withdraw", "GP 철회")}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        {mode === "move" && (
          <label className="block">
            <span className="text-xs font-medium text-slate-600">옮길 단계 (건너뛸 수 있음)</span>
            <select value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {nextStages.map((s) => (
                <option key={s} value={s}>
                  {PROPOSAL_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block min-w-64 flex-1">
          <span className="text-xs font-medium text-slate-600">{mode === "move" ? "메모 (선택)" : "사유"}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "reject" ? "예: 투자심의위원회 부결" : mode === "withdraw" ? "예: GP가 조합 결성 연기" : ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button
          type="button"
          disabled={pending || (mode === "move" && !to)}
          onClick={() => {
            if (mode !== "move" && !confirm(mode === "reject" ? "탈락 처리할까요? 되돌릴 수 없습니다." : "GP 철회로 처리할까요? 되돌릴 수 없습니다.")) return;
            run();
          }}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${mode === "move" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}
        >
          {pending ? "처리하는 중…" : mode === "move" ? "단계 옮기기" : mode === "reject" ? "탈락 처리" : "철회 처리"}
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500">선정은 선정 조건을 작성하고 선정 결재가 승인되면 됩니다 (R2-4).</p>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
