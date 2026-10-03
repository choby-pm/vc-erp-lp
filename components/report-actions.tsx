"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";

// 보고 검토 완료 · 조건 점검 기록 · 수기 보고 등록 (R5-2, BR-RPT-02·04·05, BR-CHK-01)

async function send(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fields = data.error?.details?.fields as Record<string, string> | undefined;
    throw new Error(fields ? Object.values(fields).join(" · ") : (data.error?.message ?? "처리하지 못했습니다"));
  }
  return data.data;
}

export function ReviewButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            await send(`/api/v1/reports/${reportId}/review`);
            router.refresh();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setPending(false);
          }
        }}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "처리 중…" : "검토 완료"}
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </span>
  );
}

// 점검 기록: 연동은 GP 비율을 자동으로 쓰므로 메모만, 수기는 비율(%)을 입력
export function CheckForm({ reportId, linked }: { reportId: string; linked: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ pct: "", memo: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-emerald-700 hover:underline">
        {linked ? "다시 점검" : "+ 점검 기록"}
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {!linked && (
          <label className="block text-xs text-slate-600">
            주목적 투자 비율 (%)
            <input inputMode="decimal" value={v.pct} onChange={(e) => setV({ ...v, pct: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
        )}
        <label className={`block text-xs text-slate-600 ${linked ? "sm:col-span-3" : "sm:col-span-2"}`}>
          메모 (선택)
          <input value={v.memo} onChange={(e) => setV({ ...v, memo: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
      </div>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700">
          닫기
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            try {
              const pct = v.pct.trim() === "" ? null : Number(v.pct) / 100;
              await send(`/api/v1/reports/${reportId}/compliance-checks`, { actual_ratio: linked ? null : pct, memo: v.memo });
              setOpen(false);
              router.refresh();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setPending(false);
            }
          }}
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          기록
        </button>
      </div>
    </div>
  );
}

export function NewReportForm({ fundId }: { fundId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ type: "quarterly", start: "", end: "", received: "", nav: "", pct: "", comment: "", correction: false });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-emerald-700 hover:underline">
        + 수기 보고 입력
      </button>
    );
  }
  const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs text-slate-600">GP에게서 받은 보고서의 숫자를 입력합니다. 보고서 PDF 올리기는 고도화입니다 (L36).</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-xs font-medium text-slate-600">
          보고 종류
          <select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} className={field}>
            <option value="quarterly">분기</option>
            <option value="semiannual">반기</option>
            <option value="annual">연간</option>
            <option value="monthly">월간</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          기간 시작
          <input type="date" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} className={field} />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          기간 종료 (기준일)
          <input type="date" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} className={field} />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          받은 날
          <input type="date" value={v.received} onChange={(e) => setV({ ...v, received: e.target.value })} className={field} />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          우리 몫 평가액
          <AmountInput value={v.nav} onChange={(x) => setV({ ...v, nav: x })} />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          주목적 투자 비율 (%)
          <input inputMode="decimal" value={v.pct} onChange={(e) => setV({ ...v, pct: e.target.value })} className={field} />
        </label>
        <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
          GP 의견 (선택)
          <input value={v.comment} onChange={(e) => setV({ ...v, comment: e.target.value })} className={field} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={v.correction} onChange={(e) => setV({ ...v, correction: e.target.checked })} />
        정정 보고 (같은 기간 보고를 고친 것 — 이전 보고는 대체됨으로 남는다)
      </label>
      {message && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
          취소
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setMessage(null);
            try {
              await send(`/api/v1/funds/${fundId}/reports`, {
                period_type: v.type,
                period_start: v.start,
                period_end: v.end,
                received_date: v.received,
                nav_amount: v.nav ? toAmount(v.nav) : null,
                primary_purpose_ratio: v.pct.trim() === "" ? null : Number(v.pct) / 100,
                gp_comment: v.comment,
                is_correction: v.correction,
              });
              setOpen(false);
              router.refresh();
            } catch (err) {
              setMessage((err as Error).message);
            } finally {
              setPending(false);
            }
          }}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          등록
        </button>
      </div>
    </div>
  );
}
