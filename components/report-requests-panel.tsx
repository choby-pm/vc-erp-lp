"use client";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LocalRequest } from "@/lib/services/report-requests";
const labels: Record<string, string> = {
  requested: "GP 접수 대기",
  acknowledged: "GP 접수 확인",
  replied: "회신 전송 · 수신 대기",
  received: "수신 완료",
  unavailable: "GP 회신 불가",
  cancelled: "취소",
};
type Row = Omit<
  LocalRequest,
  "last_attempt_at" | "next_retry_at" | "checked_at" | "created_at"
> & {
  last_attempt_at: string | null;
  next_retry_at: string | null;
  checked_at: string | null;
  created_at: string;
};
type Receipt = {
  request_id: string;
  gp_reply_id: string;
  report_id: string;
  version: number;
  received_at: string;
  gp_ack_at: string | null;
};
export default function ReportRequestsPanel({
  fundId,
  data,
  canWrite,
}: {
  fundId: string;
  data: { requests: Row[]; receipts: Receipt[] };
  canWrite: boolean;
}) {
  const router = useRouter(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    base = `/api/v1/funds/${fundId}/report-requests`;
  async function call(path: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const r = await fetch(path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        j = await r.json();
      if (!r.ok) throw new Error(j.error?.message);
      const d = j.data?.delivery ?? j.data;
      setMessage(
        d?.message ??
          "저장했습니다. GP 상태 확인·회신 받기로 최신 진행 상태를 확인하세요.",
      );
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "요청 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <p role="status">{message}</p>
      {canWrite && (
        <>
          <button
            disabled={busy}
            className="rounded border px-4 py-2"
            onClick={() => call(base, "PUT")}
          >
            GP 상태 확인·회신 받기
          </button>
          <form
            aria-label="분기 운용 보고 요청"
            className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void call(base, "POST", {
                as_of: f.get("as_of"),
                due_date: f.get("due_date"),
                reason: f.get("reason"),
              });
            }}
          >
            <label className="text-sm">
              분기 종료일
              <input
                type="date"
                name="as_of"
                required
                className="block rounded border p-2"
              />
            </label>
            <label className="text-sm">
              회신기한
              <input
                type="date"
                name="due_date"
                required
                className="block rounded border p-2"
              />
            </label>
            <label className="grow text-sm">
              요청 사유
              <input
                name="reason"
                required
                maxLength={2000}
                className="block w-full rounded border p-2"
              />
            </label>
            <button
              disabled={busy}
              className="rounded bg-emerald-700 px-4 py-2 text-white"
            >
              자료 요청
            </button>
          </form>
        </>
      )}
      {!data.requests.length && <p>자료 요청 기록이 없습니다.</p>}
      {data.requests.map((r) => {
        const s = r.snapshot;
        return (
          <section
            key={r.id}
            className="space-y-3 rounded-xl border bg-white p-5"
          >
            <h2 className="font-semibold">
              {r.as_of} · {s ? labels[s.status] : "GP 접수 확인 전"}{" "}
              {s?.overdue && <span className="text-amber-700">기한 경과</span>}
            </h2>
            <p className="text-sm">
              회신기한 {r.due_date} · 요청자 {r.requester} · {r.reason}
            </p>
            <p className="text-xs text-slate-500">
              한국시간 · 요청 저장 {formatDateTime(r.created_at)} · 전송{" "}
              {r.delivery_status === "sent"
                ? "성공"
                : r.delivery_status === "rejected"
                  ? "업무 거절 (자동 재시도 안 함)"
                  : "재시도 대기"}{" "}
              · 시도 {r.attempts}회 · 마지막 시도{" "}
              {r.last_attempt_at ? formatDateTime(r.last_attempt_at) : "없음"} ·
              마지막 GP 상태 확인{" "}
              {r.checked_at ? formatDateTime(r.checked_at) : "없음"}
            </p>
            {r.last_error && (
              <p role="alert" className="text-sm text-amber-800">
                {r.last_error}
              </p>
            )}
            {r.delivery_status === "pending" && (
              <p className="text-xs">
                다음 자동 시도{" "}
                {r.next_retry_at
                  ? formatDateTime(r.next_retry_at)
                  : r.attempts >= 5
                    ? "5회 도달 · 직접 재전송 필요"
                    : "다음 동기화 때"}
              </p>
            )}
            {canWrite && r.delivery_status !== "sent" && (
              <button
                disabled={busy}
                className="rounded border px-3 py-2"
                onClick={() =>
                  call(`${base}/${r.id}`, "POST", { action: "retry" })
                }
              >
                같은 요청 다시 전송
              </button>
            )}
            {s?.replies.map((p) => {
              const received = data.receipts.find(
                (c) => c.gp_reply_id === p.id,
              );
              return (
                <div key={p.id} className="rounded bg-slate-50 p-3 text-sm">
                  <p>
                    회신 v{p.version} · 자료 기준일 {r.as_of} · {p.reason}
                  </p>
                  <p>
                    GP 회신 {formatDateTime(p.replied_at)} · 우리 수신{" "}
                    {received?.received_at
                      ? formatDateTime(received.received_at)
                      : "미수신"}{" "}
                    · GP 수신 확인{" "}
                    {received?.gp_ack_at
                      ? formatDateTime(received.gp_ack_at)
                      : "미확인"}
                  </p>
                  {received && (
                    <Link
                      className="underline text-emerald-700"
                      href={`/reports/${received.report_id}`}
                    >
                      보존된 수신 보고 보기
                    </Link>
                  )}
                </div>
              );
            })}
            {canWrite &&
              (!s ||
                ["requested", "acknowledged", "replied"].includes(s.status)) &&
              !data.receipts.some(
                (c) => c.request_id === r.id && c.gp_ack_at,
              ) && (
                <form
                  aria-label={`${r.as_of} 요청 취소`}
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void call(`${base}/${r.id}`, "POST", {
                      action: "cancel",
                      reason: f.get("reason"),
                    });
                  }}
                >
                  <label className="grow text-sm">
                    취소 사유
                    <input
                      name="reason"
                      required
                      maxLength={2000}
                      className="ml-2 rounded border p-2"
                    />
                  </label>
                  <button disabled={busy} className="rounded border px-3 py-2">
                    요청 취소
                  </button>
                </form>
              )}
            <details>
              <summary className="cursor-pointer text-sm">
                업무 처리 이력
              </summary>
              {s?.history.map((h, i) => (
                <p className="text-xs" key={i}>
                  {formatDateTime(h.occurred_at)} · {h.action} · {h.reason}
                </p>
              ))}
            </details>
          </section>
        );
      })}
    </div>
  );
}
