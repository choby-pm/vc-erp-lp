"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SharingSnapshot } from "@/lib/services/sharing";
const labels = {
  reports: "운용 보고",
  obligations: "투자 의무 근거",
  attachments: "첨부 파일",
};
export default function SharingPanel({
  fundId,
  snapshot,
  canRequest,
}: {
  fundId: string;
  snapshot: SharingSnapshot;
  canRequest: boolean;
}) {
  const router = useRouter(),
    [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      <p role="status">{message}</p>
      {snapshot.resources.map((s) => (
        <section
          key={s.resource_type}
          className="rounded-xl border border-slate-200 bg-white p-4 space-y-2"
        >
          <h2 className="font-semibold">
            {labels[s.resource_type]} ·{" "}
            {s.allowed ? "공유 허용" : "공유 미허용"}
          </h2>
          <p className="text-xs text-slate-500">
            적용 {s.changed_at ?? "허용 기록 없음"}
          </p>
          {!s.allowed && canRequest && (
            <form
              className="flex gap-2"
              aria-label={`${labels[s.resource_type]} 공유 요청`}
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setBusy(true);
                try {
                  const res = await fetch(
                    `/api/v1/funds/${fundId}/sharing/requests`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        resource_type: s.resource_type,
                        reason: f.get("reason"),
                      }),
                    },
                  );
                  const j = await res.json();
                  if (!res.ok) throw new Error(j.error?.message);
                  setMessage(
                    "GP 관리자에게 공유 확대를 요청했습니다. 전송 성공은 공유 승인이 아닙니다.",
                  );
                  router.refresh();
                } catch (error) {
                  setMessage(
                    error instanceof Error ? error.message : "요청 실패",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="grow text-sm">
                공유 요청 사유
                <input
                  name="reason"
                  required
                  maxLength={2000}
                  className="block w-full rounded border p-2"
                />
              </label>
              <button disabled={busy} className="rounded border p-2 text-sm">
                공유 요청
              </button>
            </form>
          )}
          <ul className="text-sm">
            {snapshot.requests
              .filter((r) => r.resource_type === s.resource_type)
              .map((r) => (
                <li key={r.id}>
                  {r.approved === null
                    ? "GP 승인 대기"
                    : r.approved
                      ? "허용 승인"
                      : "요청 반려"}{" "}
                  · {r.reason}
                  {r.decision_reason && ` · ${r.decision_reason}`}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
