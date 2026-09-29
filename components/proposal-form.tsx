"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatDate, percentToRatio } from "@/lib/format";
import { FUND_TYPES, FUND_TYPE_LABEL, GP_TYPES, GP_TYPE_LABEL, STRATEGIES, STRATEGY_LABEL, type FundType, type GpType, type Strategy } from "@/lib/labels";

// 출자 제안 접수 (R2-3, BR-PROP-01·02, BR-PRG-04, L18)
// 경로: 출자사업 공고(모집 부문) / 개별 제안. 조합: 기존 조합 / 새 조합(기존 운용사 또는 새 운용사)

type Track = { id: string; name: string; program_name: string; apply_start_date: string; apply_end_date: string };
type Option = { id: string; name: string };
type FundOption = Option & { gp_name: string };

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

function Choice<T extends string>({ value, options, onChange, name }: { value: T; options: [T, string][]; onChange: (v: T) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex rounded-lg bg-slate-100 p-1">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${value === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function ProposalForm({ tracks, funds, gps, defaultTrackId }: { tracks: Track[]; funds: FundOption[]; gps: Option[]; defaultTrackId?: string }) {
  const router = useRouter();
  const [channel, setChannel] = useState<"program" | "direct">(defaultTrackId || tracks.length ? "program" : "direct");
  const [trackId, setTrackId] = useState(defaultTrackId ?? tracks[0]?.id ?? "");
  const [fundMode, setFundMode] = useState<"existing" | "new">(funds.length ? "existing" : "new");
  const [fundId, setFundId] = useState(funds[0]?.id ?? "");
  const [gpMode, setGpMode] = useState<"existing" | "new">(gps.length ? "existing" : "new");
  const [gpId, setGpId] = useState(gps[0]?.id ?? "");
  const [newGp, setNewGp] = useState({ name: "", gp_type: "venture_capital" as GpType });
  const [nf, setNf] = useState({ name: "", fund_type: "venture" as FundType, strategy: "early" as Strategy, target_amount: "", term_years: "", investment_period_years: "", management_fee_rate: "", carry_rate: "", hurdle_rate: "" });
  const [requested, setRequested] = useState("");
  const [receivedDate, setReceivedDate] = useState(today());
  const [memo, setMemo] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; existingId?: string } | null>(null);
  const [pending, setPending] = useState(false);

  const track = tracks.find((t) => t.id === trackId);
  const num = (v: string) => (v === "" ? null : Number(v));
  const pct = (v: string) => (v === "" ? null : percentToRatio(Number(v)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setFormError(null);
    const body = {
      proposal_channel: channel,
      program_track_id: channel === "program" ? trackId || null : null,
      ...(fundMode === "existing"
        ? { fund_id: fundId || null }
        : {
            new_fund: {
              ...(gpMode === "existing" ? { gp_id: gpId || null } : { new_gp: newGp }),
              name: nf.name,
              fund_type: nf.fund_type,
              strategy: nf.strategy,
              target_amount: toAmount(nf.target_amount),
              term_years: num(nf.term_years),
              investment_period_years: num(nf.investment_period_years),
              management_fee_rate: pct(nf.management_fee_rate),
              carry_rate: pct(nf.carry_rate),
              hurdle_rate: pct(nf.hurdle_rate),
            },
          }),
      requested_amount: toAmount(requested),
      received_date: receivedDate,
      memo,
    };
    const res = await fetch("/api/v1/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      router.push(`/proposals/${data.data.id}`);
      router.refresh();
      return;
    }
    setErrors(data.error?.details?.fields ?? {});
    setFormError({ message: data.error?.message ?? "등록하지 못했습니다", existingId: data.error?.details?.existing_proposal_id });
    setPending(false);
  }

  const err = (key: string) => (errors[key] ? <p className="mt-1 text-xs text-red-600">{errors[key]}</p> : null);
  const pctField = (key: "management_fee_rate" | "carry_rate" | "hurdle_rate", label: string) => (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="relative">
        <input inputMode="decimal" value={nf[key]} onChange={(e) => setNf({ ...nf, [key]: e.target.value.replace(/[^0-9.]/g, "") })} className={`${inputClass} pr-8 text-right`} />
        <span className="pointer-events-none absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-slate-400">%</span>
      </div>
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">제안 경로</h2>
          <Choice name="제안 경로" value={channel} onChange={setChannel} options={[["program", "출자사업 공고"], ["direct", "개별 제안"]]} />
        </div>
        {channel === "program" &&
          (tracks.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              접수 중인 출자사업이 없습니다. <Link href="/programs" className="font-semibold underline">출자사업</Link>을 공고하거나 개별 제안으로 등록하세요.
            </p>
          ) : (
            <label className="block">
              <span className="text-sm font-medium text-slate-700">모집 부문</span>
              <select value={trackId} onChange={(e) => setTrackId(e.target.value)} className={inputClass}>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.program_name} · {t.name}
                  </option>
                ))}
              </select>
              {track && <p className="mt-1 text-xs text-slate-500">접수 기간 {formatDate(track.apply_start_date)} ~ {formatDate(track.apply_end_date)}</p>}
              {err("program_track_id")}
            </label>
          ))}
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">조합</h2>
          <Choice name="조합 선택" value={fundMode} onChange={setFundMode} options={[["existing", "등록된 조합"], ["new", "새 조합"]]} />
        </div>
        {fundMode === "existing" ? (
          funds.length === 0 ? (
            <p className="text-sm text-slate-500">제안을 받을 수 있는 등록된 조합이 없습니다. 새 조합으로 등록하세요.</p>
          ) : (
            <label className="block">
              <span className="text-sm font-medium text-slate-700">조합 (아직 제안이 없는 수기 조합)</span>
              <select value={fundId} onChange={(e) => setFundId(e.target.value)} className={inputClass}>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.gp_name} · {f.name}
                  </option>
                ))}
              </select>
              {err("fund_id")}
            </label>
          )
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-slate-700">운용사</span>
              <Choice name="운용사 선택" value={gpMode} onChange={setGpMode} options={[["existing", "등록된 운용사"], ["new", "새 운용사"]]} />
            </div>
            {gpMode === "existing" ? (
              <select aria-label="운용사" value={gpId} onChange={(e) => setGpId(e.target.value)} className={inputClass}>
                {gps.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">새 운용사명</span>
                  <input value={newGp.name} onChange={(e) => setNewGp({ ...newGp, name: e.target.value })} className={inputClass} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">운용사 유형</span>
                  <select value={newGp.gp_type} onChange={(e) => setNewGp({ ...newGp, gp_type: e.target.value as GpType })} className={inputClass}>
                    {GP_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {GP_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block sm:col-span-3">
                <span className="text-sm font-medium text-slate-700">조합명</span>
                <input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="예: 그로스 2호 벤처투자조합" className={inputClass} />
                {err("new_fund.name")}
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">조합 유형</span>
                <select value={nf.fund_type} onChange={(e) => setNf({ ...nf, fund_type: e.target.value as FundType })} className={inputClass}>
                  {FUND_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {FUND_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">조합 분야</span>
                <select value={nf.strategy} onChange={(e) => setNf({ ...nf, strategy: e.target.value as Strategy })} className={inputClass}>
                  {STRATEGIES.map((s) => (
                    <option key={s} value={s}>
                      {STRATEGY_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">목표 결성액</span>
                <AmountInput value={nf.target_amount} onChange={(v) => setNf({ ...nf, target_amount: v })} placeholder="원 단위" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">존속 기간 (년)</span>
                <input inputMode="numeric" value={nf.term_years} onChange={(e) => setNf({ ...nf, term_years: e.target.value.replace(/[^0-9]/g, "") })} className={`${inputClass} text-right`} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">투자 기간 (년)</span>
                <input inputMode="numeric" value={nf.investment_period_years} onChange={(e) => setNf({ ...nf, investment_period_years: e.target.value.replace(/[^0-9]/g, "") })} className={`${inputClass} text-right`} />
              </label>
              {pctField("management_fee_rate", "관리보수율 (연)")}
              {pctField("carry_rate", "성과보수율")}
              {pctField("hurdle_rate", "기준수익률 (연)")}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">제안 내용</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">요청 출자액</span>
            <AmountInput value={requested} onChange={setRequested} invalid={!!errors.requested_amount} placeholder="GP가 요청한 금액" />
            {err("requested_amount")}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">접수일</span>
            <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className={inputClass} />
            {err("received_date")}
          </label>
          <label className="block sm:col-span-3">
            <span className="text-sm font-medium text-slate-700">내부 메모</span>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} className={inputClass} />
            <p className="mt-1 text-xs text-slate-500">GP에 보내지 않습니다.</p>
          </label>
        </div>
      </section>

      {formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError.message}
          {Object.keys(errors).length > 0 && ` (${Object.values(errors).join(", ")})`}
          {formError.existingId && (
            <Link href={`/proposals/${formError.existingId}`} className="ml-2 font-semibold underline">
              기존 제안 보기
            </Link>
          )}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Link href="/proposals" className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          취소
        </Link>
        <button type="submit" disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
          {pending ? "접수하는 중…" : "제안 접수"}
        </button>
      </div>
    </form>
  );
}
