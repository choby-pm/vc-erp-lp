"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PullResult = { connection: string; fetched: number; stored: number; duplicate: number; before_link: number; error?: string };

// "지금 가져오기": GP에서 놓친 이벤트를 가져와 인박스에 넣고 처리한다 (BR-SYNC-08)
export function PullButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function pull() {
    setPending(true);
    setMessage(null);
    const res = await fetch("/api/v1/integration/pull", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) return setMessage(body.error?.message ?? "가져오지 못했습니다");
    const data = body.data as { skipped: boolean; pulled: PullResult[]; processed: { processed: number; ignored: number; failed: number } | null };
    if (data.skipped) return setMessage("다른 동기화 작업이 실행 중입니다. 잠시 후 다시 누르세요");
    setMessage(
      data.pulled
        .map((r) => (r.error ? `${r.connection}: 실패 (${r.error})` : `${r.connection}: GP 이벤트 ${r.fetched}건 확인 · 새로 저장 ${r.stored}건 · 이미 받음 ${r.duplicate}건 · 연결 전 ${r.before_link}건`))
        .join(" / ") +
        (data.processed ? ` · 처리 ${data.processed.processed}건 · 무시 ${data.processed.ignored}건 · 실패 ${data.processed.failed}건` : ""),
    );
    router.refresh();
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button type="button" onClick={pull} disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
        {pending ? "가져오는 중…" : "지금 가져오기"}
      </button>
      {message && <p className="max-w-xs text-right text-xs text-slate-600">{message}</p>}
    </div>
  );
}

// 실패 이벤트 다시 처리 (BR-SYNC-07)
export function RetryButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function retry() {
    setPending(true);
    const res = await fetch(`/api/v1/integration/events/${eventId}/retry`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) return setMessage(body.error?.message ?? "다시 처리하지 못했습니다");
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={retry} disabled={pending} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
        {pending ? "처리 중…" : "다시 처리"}
      </button>
      {message && <span className="text-xs text-rose-600">{message}</span>}
    </span>
  );
}

// 조합 화면의 "GP와 다시 맞추기" (BR-SYNC-09)
export function ResyncButton({ fundId }: { fundId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function resync() {
    setPending(true);
    setMessage(null);
    const res = await fetch(`/api/v1/funds/${fundId}/resync`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) return setMessage(body.error?.message ?? "맞추지 못했습니다");
    const ledger = body.data?.ledger as { inserted: number; skipped?: string } | undefined;
    setMessage(
      `GP와 맞췄습니다${ledger ? (ledger.skipped ? " · 출자 건이 없어 원장 사본은 건너뜀" : ` · 원장 사본 새로 ${ledger.inserted}건`) : ""}`,
    );
    router.refresh();
  }

  return (
    <span className="inline-flex shrink-0 flex-col items-end gap-1">
      <button type="button" onClick={resync} disabled={pending} className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60">
        {pending ? "맞추는 중…" : "GP와 다시 맞추기"}
      </button>
      {message && <span className="text-xs text-sky-900">{message}</span>}
    </span>
  );
}

type GpSync = { status: "not_needed" | "sent" | "pending" | "rejected"; message?: string };
const GP_SYNC_MESSAGE: Record<GpSync["status"], string> = {
  not_needed: "보낼 응답이 없습니다",
  sent: "GP에 보냈습니다",
  pending: "GP에 닿지 못했습니다. 나중에 자동으로 다시 보냅니다",
  rejected: "GP가 거부했습니다",
};

// 제안 화면의 "GP에 다시 보내기" (BR-SYNC-11)
export function ResendGpResponseButton({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function resend() {
    setPending(true);
    setMessage(null);
    const res = await fetch(`/api/v1/proposals/${proposalId}/gp-response/resend`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) return setMessage(body.error?.message ?? "보내지 못했습니다");
    const r = body.data as GpSync;
    setMessage(r.status === "sent" ? null : `${GP_SYNC_MESSAGE[r.status]}${r.message ? ` — ${r.message}` : ""}`);
    router.refresh();
  }

  return (
    <span className="inline-flex shrink-0 flex-col items-end gap-1">
      <button type="button" onClick={resend} disabled={pending} className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60">
        {pending ? "보내는 중…" : "GP에 다시 보내기"}
      </button>
      {message && <span className="max-w-xs text-right text-xs text-rose-700">{message}</span>}
    </span>
  );
}

// GP 연동 화면의 "못 보낸 것 지금 보내기" (관리자, BR-SYNC-11)
export function SendPendingButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function send() {
    setPending(true);
    setMessage(null);
    const res = await fetch("/api/v1/integration/send-pending", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) return setMessage(body.error?.message ?? "보내지 못했습니다");
    const r = body.data as { sent: number; pending: number; rejected: number };
    setMessage(`보냄 ${r.sent}건 · 아직 못 보냄 ${r.pending}건 · GP 거부 ${r.rejected}건`);
    router.refresh();
  }

  return (
    <span className="inline-flex shrink-0 flex-col items-end gap-1">
      <button type="button" onClick={send} disabled={pending} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
        {pending ? "보내는 중…" : "못 보낸 것 지금 보내기"}
      </button>
      {message && <span className="text-xs text-slate-600">{message}</span>}
    </span>
  );
}
