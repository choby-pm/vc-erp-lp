"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatKRW, formatPercent, percentToRatio, ratioToPercent } from "@/lib/format";
import { STRATEGIES, STRATEGY_LABEL, type ProgramStatus, type Strategy } from "@/lib/labels";

// 출자사업 작성 · 모집 부문 편집 · 상태 이동 (R2-2, BR-PRG-01~03)

type ApiError = { error?: { message?: string; details?: { fields?: Record<string, string> } } };
type Budget = { id: string; budget_year: number };
type Track = {
  id: string;
  name: string;
  strategy: Strategy;
  planned_amount: number;
  target_gp_count: number;
  min_fund_size_amount: number | null;
  max_commitment_ratio: number | null;
  proposal_count: number;
  selected_count: number;
  selected_amount: number;
};

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as ApiError).error;
    const err = new Error(e?.message ?? "저장하지 못했습니다") as Error & { fields?: Record<string, string> };
    err.fields = e?.details?.fields;
    throw err;
  }
  return (data as { data: { id: string; warnings?: string[] } }).data;
}

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export function ProgramForm({
  budgets,
  program,
}: {
  budgets: Budget[];
  program?: { id: string; budget_id: string; name: string; apply_start_date: string; apply_end_date: string };
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    budget_id: program?.budget_id ?? budgets[0]?.id ?? "",
    name: program?.name ?? "",
    apply_start_date: program?.apply_start_date ?? "",
    apply_end_date: program?.apply_end_date ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setErrors({});
        setMessage(null);
        try {
          const p = await send(program ? `/api/v1/programs/${program.id}` : "/api/v1/programs", program ? "PATCH" : "POST", values);
          router.push(`/programs/${p.id}`);
          router.refresh();
        } catch (err) {
          setErrors((err as { fields?: Record<string, string> }).fields ?? {});
          setMessage((err as Error).message);
          setPending(false);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-slate-700">사업명</span>
          <input value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} placeholder="예: 2026년 정기 출자사업" className={inputClass} />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">예산 연도</span>
          <select value={values.budget_id} onChange={(e) => setValues({ ...values, budget_id: e.target.value })} className={inputClass}>
            {budgets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.budget_year}년 예산
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">선정하면 이 예산을 씁니다</p>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">접수 시작일</span>
          <input type="date" value={values.apply_start_date} onChange={(e) => setValues({ ...values, apply_start_date: e.target.value })} className={inputClass} />
          {errors.apply_start_date && <p className="mt-1 text-xs text-red-600">{errors.apply_start_date}</p>}
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">접수 종료일</span>
          <input type="date" value={values.apply_end_date} onChange={(e) => setValues({ ...values, apply_end_date: e.target.value })} className={inputClass} />
          {errors.apply_end_date && <p className="mt-1 text-xs text-red-600">{errors.apply_end_date}</p>}
        </label>
      </div>
      {message && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
          {pending ? "저장하는 중…" : program ? "저장" : "사업 만들기"}
        </button>
      </div>
    </form>
  );
}

const emptyTrack = { name: "", strategy: "early" as Strategy, planned_amount: "", target_gp_count: "", min_fund_size_amount: "", max_commitment_ratio: "" };

function TrackRowForm({ programId, track, onDone }: { programId: string; track?: Track; onDone: () => void }) {
  const router = useRouter();
  const [v, setV] = useState(
    track
      ? {
          name: track.name,
          strategy: track.strategy,
          planned_amount: String(track.planned_amount),
          target_gp_count: String(track.target_gp_count),
          min_fund_size_amount: track.min_fund_size_amount ? String(track.min_fund_size_amount) : "",
          max_commitment_ratio: track.max_commitment_ratio === null ? "" : String(ratioToPercent(track.max_commitment_ratio)),
        }
      : emptyTrack,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <tr className="bg-emerald-50/40">
      <td colSpan={7} className="px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-6">
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-slate-600">부문명</span>
            <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="예: 초기 부문" className={inputClass} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">분야</span>
            <select value={v.strategy} onChange={(e) => setV({ ...v, strategy: e.target.value as Strategy })} className={inputClass}>
              {STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {STRATEGY_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-slate-600">부문 출자 예정액</span>
            <AmountInput value={v.planned_amount} onChange={(x) => setV({ ...v, planned_amount: x })} placeholder="원 단위" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">선정 GP 수</span>
            <input inputMode="numeric" value={v.target_gp_count} onChange={(e) => setV({ ...v, target_gp_count: e.target.value.replace(/[^0-9]/g, "") })} className={`${inputClass} text-right`} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-slate-600">최소 결성 규모 (선택)</span>
            <AmountInput value={v.min_fund_size_amount} onChange={(x) => setV({ ...v, min_fund_size_amount: x })} placeholder="원 단위" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">출자 비율 상한 % (선택)</span>
            <input inputMode="decimal" value={v.max_commitment_ratio} onChange={(e) => setV({ ...v, max_commitment_ratio: e.target.value.replace(/[^0-9.]/g, "") })} className={`${inputClass} text-right`} />
          </label>
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
            취소
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError(null);
              try {
                await send(track ? `/api/v1/programs/${programId}/tracks/${track.id}` : `/api/v1/programs/${programId}/tracks`, track ? "PATCH" : "POST", {
                  name: v.name,
                  strategy: v.strategy,
                  planned_amount: toAmount(v.planned_amount),
                  target_gp_count: v.target_gp_count === "" ? null : Number(v.target_gp_count),
                  min_fund_size_amount: toAmount(v.min_fund_size_amount),
                  max_commitment_ratio: v.max_commitment_ratio === "" ? null : percentToRatio(Number(v.max_commitment_ratio)),
                });
                onDone();
                router.refresh();
              } catch (err) {
                const fields = (err as { fields?: Record<string, string> }).fields;
                setError(fields ? Object.values(fields).join(", ") : (err as Error).message);
              } finally {
                setPending(false);
              }
            }}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {pending ? "저장하는 중…" : "부문 저장"}
          </button>
        </div>
      </td>
    </tr>
  );
}

export function TrackTable({ programId, tracks, editable }: { programId: string; tracks: Track[]; editable: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">모집 부문</h2>
        {editable && editing === null && (
          <button type="button" onClick={() => setEditing("new")} className="text-sm font-semibold text-emerald-700 hover:underline">
            + 부문 추가
          </button>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs font-semibold text-slate-500">
          <tr>
            <th className="px-5 py-2">부문</th>
            <th className="px-5 py-2">분야</th>
            <th className="px-5 py-2 text-right">출자 예정액</th>
            <th className="px-5 py-2 text-right">선정 GP</th>
            <th className="px-5 py-2">조건</th>
            <th className="px-5 py-2 text-right">접수 · 선정</th>
            <th className="px-5 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tracks.map((t) =>
            editing === t.id ? (
              <TrackRowForm key={t.id} programId={programId} track={t} onDone={() => setEditing(null)} />
            ) : (
              <tr key={t.id}>
                <td className="px-5 py-3 font-medium text-slate-900">{t.name}</td>
                <td className="px-5 py-3 text-slate-600">{STRATEGY_LABEL[t.strategy]}</td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                  {formatKRW(t.planned_amount)}
                  {t.selected_amount > 0 && <p className="text-xs text-slate-500">선정 {formatKRW(t.selected_amount)}</p>}
                </td>
                <td className="px-5 py-3 text-right text-slate-700">{t.target_gp_count}곳</td>
                <td className="px-5 py-3 text-xs text-slate-600">
                  {t.min_fund_size_amount ? `결성 ${formatKRW(t.min_fund_size_amount)} 이상` : "결성 규모 제한 없음"}
                  <br />
                  {t.max_commitment_ratio !== null ? `출자 비율 ${formatPercent(t.max_commitment_ratio)} 이하` : "출자 비율 제한 없음"}
                </td>
                <td className="px-5 py-3 text-right text-slate-700">
                  {t.proposal_count}건 · {t.selected_count}곳
                </td>
                <td className="px-5 py-3 text-right">
                  {editable && editing === null && (
                    <span className="inline-flex gap-3 text-xs font-medium">
                      <button type="button" onClick={() => setEditing(t.id)} className="text-emerald-700 hover:underline">
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`'${t.name}' 부문을 삭제할까요?`)) return;
                          try {
                            await send(`/api/v1/programs/${programId}/tracks/${t.id}`, "DELETE");
                            router.refresh();
                          } catch (err) {
                            setError((err as Error).message);
                          }
                        }}
                        className="text-rose-700 hover:underline"
                      >
                        삭제
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ),
          )}
          {editing === "new" && <TrackRowForm programId={programId} onDone={() => setEditing(null)} />}
          {tracks.length === 0 && editing !== "new" && (
            <tr>
              <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                모집 부문이 없습니다. 공고하려면 부문이 1개 이상 있어야 합니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {error && <p role="alert" className="border-t border-slate-200 px-5 py-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}

const ACTIONS: Partial<Record<ProgramStatus, { path: string; label: string; confirm: string }>> = {
  draft: { path: "open", label: "공고하기", confirm: "공고하면 사업 정보와 모집 부문을 더 이상 바꿀 수 없습니다. 공고할까요?" },
  open: { path: "start-review", label: "접수 마감 · 심사 시작", confirm: "접수를 마감하고 심사를 시작할까요? 더 이상 제안을 받지 않습니다." },
  reviewing: { path: "close", label: "선정 완료", confirm: "선정을 완료할까요? 모든 제안이 결정되어 있어야 합니다." },
};

export function ProgramActions({ programId, status }: { programId: string; status: ProgramStatus }) {
  const router = useRouter();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const action = ACTIONS[status];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        {status === "draft" && (
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              if (!confirm("작성 중인 출자사업을 삭제할까요?")) return;
              try {
                await send(`/api/v1/programs/${programId}`, "DELETE");
                router.push("/programs");
                router.refresh();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
          >
            삭제
          </button>
        )}
        {action && (
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              if (!confirm(action.confirm)) return;
              setPending(true);
              setError(null);
              try {
                const p = await send(`/api/v1/programs/${programId}/${action.path}`, "POST");
                setWarnings(p.warnings ?? []);
                router.refresh();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setPending(false);
              }
            }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {pending ? "처리하는 중…" : action.label}
          </button>
        )}
      </div>
      {warnings.map((w) => (
        <p key={w} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ {w}
        </p>
      ))}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
