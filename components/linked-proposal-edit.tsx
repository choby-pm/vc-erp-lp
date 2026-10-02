"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Track = { id: string; name: string; program_name: string };

// 연동 제안 수정: 공고 부문 · 내부 메모 (R3-5, BR-PROP-03). 금액·접수일은 GP 값이라 고칠 수 없다
// 부문을 붙이면 공고형, 비우면 개별 제안. 접수 기간은 검사하지 않는다. 선정 조건을 쓴 뒤에는 부문을 바꿀 수 없다
export default function LinkedProposalEdit({
  proposalId,
  trackId,
  memo,
  tracks,
  trackLocked,
}: {
  proposalId: string;
  trackId: string | null;
  memo: string | null;
  tracks: Track[];
  trackLocked: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ track: trackId ?? "", memo: memo ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-emerald-700 hover:underline">
        공고 부문·메모 수정
      </button>
    );
  }
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">공고 부문</span>
          <select
            value={v.track}
            disabled={trackLocked}
            onChange={(e) => setV({ ...v, track: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          >
            <option value="">없음 (개별 제안)</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.program_name} · {t.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            {trackLocked ? "선정 조건을 쓴 뒤라 부문을 바꿀 수 없습니다" : "공고 중·심사 중인 출자사업만. GP 제안이라 접수 기간은 따지지 않습니다"}
          </span>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">내부 메모</span>
          <input value={v.memo} onChange={(e) => setV({ ...v, memo: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700">
          취소
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            const res = await fetch(`/api/v1/proposals/${proposalId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ program_track_id: v.track || null, memo: v.memo }),
            });
            const data = await res.json().catch(() => ({}));
            setPending(false);
            if (!res.ok) {
              setError(data.error?.message ?? "저장하지 못했습니다");
              return;
            }
            setOpen(false);
            router.refresh();
          }}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          저장
        </button>
      </div>
    </div>
  );
}
