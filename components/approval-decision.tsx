"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

// 결재 승인 · 반려 (R2-4, BR-APR-05~07). 승인은 Idempotency-Key 로 두 번 눌러도 한 번만 처리된다
export default function ApprovalDecision({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  // 같은 화면에서 다시 누르면 같은 키로 보낸다 (응답을 잃어버려도 두 번 승인되지 않게)
  const approveKey = useRef(crypto.randomUUID());

  async function decide(kind: "approve" | "reject") {
    if (kind === "reject" && !comment.trim()) {
      setError("반려 사유를 입력하세요");
      return;
    }
    if (!confirm(kind === "approve" ? "승인할까요? 승인하면 되돌릴 수 없습니다." : "반려할까요?")) return;
    setPending(kind);
    setError(null);
    const res = await fetch(`/api/v1/approvals/${approvalId}/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(kind === "approve" ? { "Idempotency-Key": approveKey.current } : {}) },
      body: JSON.stringify({ decision_comment: comment }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(null);
    if (!res.ok) {
      setError(data.error?.message ?? "처리하지 못했습니다");
      approveKey.current = crypto.randomUUID(); // 실패한 요청은 저장되지 않으므로 새 키로
      return;
    }
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">결재</h2>
      <label className="mt-3 block">
        <span className="text-xs font-medium text-slate-600">의견 (반려할 때는 필수)</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" disabled={pending !== null} onClick={() => decide("reject")} className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60">
          {pending === "reject" ? "반려하는 중…" : "반려"}
        </button>
        <button type="button" disabled={pending !== null} onClick={() => decide("approve")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
          {pending === "approve" ? "승인하는 중…" : "승인"}
        </button>
      </div>
    </section>
  );
}
