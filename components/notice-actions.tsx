"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { NOTICE_TYPE_LABEL } from "@/lib/labels";

// 통지 확인 · 수기 통지 기록 (R5-1, BR-NTC-01·02)

export function AckButton({ noticeId }: { noticeId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setMessage(null);
          const res = await fetch(`/api/v1/notices/${noticeId}/acknowledge`, { method: "POST" });
          const body = await res.json().catch(() => ({}));
          setPending(false);
          if (!res.ok) return setMessage(body.error?.message ?? "확인하지 못했습니다");
          if (body.data?.gp_sync?.status === "pending") setMessage("확인했습니다. GP에는 아직 못 보내 나중에 다시 보냅니다");
          router.refresh();
        }}
        className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "확인 중…" : "확인"}
      </button>
      {message && <span className="max-w-[14rem] text-right text-xs text-amber-700">{message}</span>}
    </span>
  );
}

export function NewNoticeForm({ funds }: { funds: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ fund: "", type: "general", title: "", body: "", date: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
        + 수기 통지 기록
      </button>
    );
  }
  const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  return (
    <div className="w-full space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-xs text-slate-600">우편·메일로 받은 통지를 기록합니다. 연동 GP의 통지는 자동으로 들어옵니다.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">조합 (수기 조합, 선택)</span>
          <select value={v.fund} onChange={(e) => setV({ ...v, fund: e.target.value })} className={field}>
            <option value="">조합 없음</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">종류</span>
          <select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} className={field}>
            {Object.entries(NOTICE_TYPE_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">받은 날</span>
          <input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className={field} />
          {errors.received_date && <span className="text-xs text-rose-600">{errors.received_date}</span>}
        </label>
      </div>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">제목</span>
        <input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} className={field} />
        {errors.title && <span className="text-xs text-rose-600">{errors.title}</span>}
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">내용 (선택)</span>
        <textarea rows={4} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} className={field} />
      </label>
      {message && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700">
          취소
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setErrors({});
            setMessage(null);
            const res = await fetch("/api/v1/notices", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fund_id: v.fund || null, notice_type: v.type, title: v.title, body: v.body, received_date: v.date }),
            });
            const body = await res.json().catch(() => ({}));
            setPending(false);
            if (!res.ok) {
              setErrors(body.error?.details?.fields ?? {});
              setMessage(body.error?.message ?? "기록하지 못했습니다");
              return;
            }
            setOpen(false);
            setV({ fund: "", type: "general", title: "", body: "", date: "" });
            router.refresh();
          }}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          기록
        </button>
      </div>
    </div>
  );
}
