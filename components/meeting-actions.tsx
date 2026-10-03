"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AGENDA_TYPE_LABEL, VOTE_CHOICE_LABEL } from "@/lib/labels";
import type { MeetingDetail } from "@/lib/services/meetings";

// 투표안 · 투표 결재 · 제출 · 수기 결과 (R5-3, BR-VOTE-01~06)

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fields = data.error?.details?.fields as Record<string, string> | undefined;
    throw new Error(fields && !fields.agenda_id ? Object.values(fields).join(" · ") : (data.error?.message ?? "처리하지 못했습니다"));
  }
  return data.data;
}

export function VotePanel({ meeting, canWrite }: { meeting: MeetingDetail; canWrite: boolean }) {
  const router = useRouter();
  const editable = canWrite && meeting.can_vote && !meeting.pending_approval;
  const [v, setV] = useState(() => Object.fromEntries(meeting.agendas.map((a) => [a.id, { choice: a.choice ?? "", opinion: a.review_opinion ?? "" }])));
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = meeting.agendas.some((a) => (a.choice ?? "") !== v[a.id].choice || (a.review_opinion ?? "") !== v[a.id].opinion);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setPending(true);
    setMessage(null);
    try {
      const r = (await fn()) as { gp_sync?: { status: string; message?: string } } | undefined;
      const s = r?.gp_sync?.status;
      setMessage({ ok: s !== "pending" && s !== "rejected", text: s === "pending" ? "GP에 닿지 못했습니다. 나중에 다시 보냅니다" : s === "rejected" ? `GP가 거부했습니다: ${r?.gp_sync?.message}` : done });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setPending(false);
    }
  };
  const save = () =>
    call("PUT", `/api/v1/meetings/${meeting.id}/votes`, {
      votes: meeting.agendas.map((a) => ({ agenda_id: a.id, choice: v[a.id].choice || null, review_opinion: v[a.id].opinion })),
    });

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">안건 · 우리 투표</h2>
      <ol className="space-y-4">
        {meeting.agendas.map((a) => (
          <li key={a.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-slate-900">
                제{a.agenda_no}호 · {a.title} <span className="ml-1 text-xs font-normal text-slate-500">{AGENDA_TYPE_LABEL[a.agenda_type] ?? a.agenda_type}</span>
              </p>
              {a.result !== "pending" && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${a.result === "passed" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{a.result === "passed" ? "가결" : "부결"}</span>
              )}
            </div>
            {a.description && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.description}</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr]">
              <div role="radiogroup" aria-label={`제${a.agenda_no}호 찬반`} className="inline-flex h-fit rounded-lg bg-slate-100 p-1">
                {(["for", "against", "abstain"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={v[a.id].choice === c}
                    disabled={!editable}
                    onClick={() => setV({ ...v, [a.id]: { ...v[a.id], choice: v[a.id].choice === c ? "" : c } })}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-default ${v[a.id].choice === c ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                  >
                    {VOTE_CHOICE_LABEL[c]}
                  </button>
                ))}
              </div>
              <textarea
                rows={2}
                value={v[a.id].opinion}
                disabled={!editable}
                onChange={(e) => setV({ ...v, [a.id]: { ...v[a.id], opinion: e.target.value } })}
                placeholder="내부 검토 의견 (GP에 보내지 않음)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
              />
            </div>
            {a.submitted_at && (
              <p className="mt-2 text-xs text-emerald-700">
                제출됨 · {VOTE_CHOICE_LABEL[a.choice ?? ""]}
                {a.gp_vote_channel === "gp" ? " (GP가 기록)" : a.gp_vote_channel === "lp_system" ? " (LP 직접)" : ""}
              </p>
            )}
          </li>
        ))}
      </ol>

      {message && <p role="alert" className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>}

      {editable && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" disabled={pending || !dirty} onClick={() => run(save, "투표안을 저장했습니다")} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            투표안 저장
          </button>
          {meeting.submit_status !== "submitted" && (
            <>
              <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="기안 의견 (선택)" className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    if (dirty) await save();
                    return call("POST", `/api/v1/meetings/${meeting.id}/vote-approvals`, { request_comment: comment });
                  }, "투표 결재를 올렸습니다")
                }
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                투표 결재 올리기
              </button>
            </>
          )}
        </div>
      )}
      {canWrite && (meeting.submit_status === "approved_unsent" || meeting.submit_status === "failed") && (
        <div className="flex justify-end">
          {meeting.data_source === "gp_api" ? (
            <button type="button" disabled={pending} onClick={() => run(() => call("POST", `/api/v1/meetings/${meeting.id}/resubmit`), "GP에 제출했습니다")} className="rounded-lg border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-60">
              GP에 다시 제출
            </button>
          ) : (
            <button type="button" disabled={pending} onClick={() => run(() => call("POST", `/api/v1/meetings/${meeting.id}/mark-submitted`), "서면 제출을 기록했습니다")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              서면 제출 완료 기록
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// 수기 총회 결과 기록 (개최 뒤)
export function ManualResultsForm({ meeting }: { meeting: MeetingDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [r, setR] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-emerald-700 hover:underline">
        총회 결과 기록
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
      {meeting.agendas.map((a) => (
        <label key={a.id} className="flex items-center justify-between gap-3 text-sm">
          <span>
            제{a.agenda_no}호 {a.title}
          </span>
          <select value={r[a.id] ?? ""} onChange={(e) => setR({ ...r, [a.id]: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
            <option value="">고르세요</option>
            <option value="passed">가결</option>
            <option value="rejected">부결</option>
          </select>
        </label>
      ))}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs">
          닫기
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await call("POST", `/api/v1/meetings/${meeting.id}/results`, { results: meeting.agendas.map((a) => ({ agenda_id: a.id, result: r[a.id] })) });
              router.refresh();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white"
        >
          기록 (개최 완료)
        </button>
      </div>
    </div>
  );
}

// 수기 총회 등록 (수기 조합)
export function NewMeetingForm({ fundId }: { fundId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ type: "regular", date: "", location: "" });
  const [agendas, setAgendas] = useState([{ agenda_type: "report_approval", title: "", description: "" }]);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-emerald-700 hover:underline">
        + 수기 총회 입력
      </button>
    );
  }
  const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-slate-600">
          총회 종류
          <select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} className={field}>
            <option value="regular">정기총회</option>
            <option value="extraordinary">임시총회</option>
            <option value="dissolution">해산총회</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          총회일
          <input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className={field} />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          장소 (선택)
          <input value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} className={field} />
        </label>
      </div>
      {agendas.map((a, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr_1fr]">
          <select value={a.agenda_type} onChange={(e) => setAgendas(agendas.map((x, j) => (j === i ? { ...x, agenda_type: e.target.value } : x)))} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
            {Object.entries(AGENDA_TYPE_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <input value={a.title} onChange={(e) => setAgendas(agendas.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder={`제${i + 1}호 안건 제목`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input value={a.description} onChange={(e) => setAgendas(agendas.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} placeholder="설명 (선택)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
      ))}
      <button type="button" onClick={() => setAgendas([...agendas, { agenda_type: "other", title: "", description: "" }])} className="text-xs text-emerald-700 hover:underline">
        + 안건 추가
      </button>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
          취소
        </button>
        <button
          type="button"
          onClick={async () => {
            setError(null);
            try {
              const m = await call("POST", `/api/v1/funds/${fundId}/meetings`, { meeting_type: v.type, meeting_date: v.date, location: v.location, agendas });
              router.push(`/meetings/${m.id}`);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          등록
        </button>
      </div>
    </div>
  );
}
