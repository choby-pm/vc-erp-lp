"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { percentToRatio, ratioToPercent } from "@/lib/format";
import { FUND_TYPES, FUND_TYPE_LABEL, STRATEGIES, STRATEGY_LABEL, type FundType, type Strategy } from "@/lib/labels";
import type { FundDetail } from "@/lib/services/funds";

// 수기 조합 등록·수정 공용 폼 (R1-3, L18)
// 비율은 화면에서 % 로 입력받고 API에는 소수로 보낸다 (2 → 0.02)

type Errors = Record<string, string>;
type GpOption = { id: string; name: string };

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(ratioToPercent(v)));
const toRatio = (v: string) => (v.trim() === "" ? null : percentToRatio(Number(v)));
const toYears = (v: string) => (v.trim() === "" ? null : Number(v));

export default function FundForm({ fund, gps, defaultGpId }: { fund?: FundDetail; gps?: GpOption[]; defaultGpId?: string }) {
  const router = useRouter();
  const [values, setValues] = useState({
    gp_id: fund?.gp_id ?? defaultGpId ?? gps?.[0]?.id ?? "",
    status: "fundraising" as "planning" | "fundraising",
    name: fund?.name ?? "",
    fund_type: (fund?.fund_type ?? "venture") as FundType,
    strategy: (fund?.strategy ?? "early") as Strategy,
    target_amount: fund?.target_amount ? String(fund.target_amount) : "",
    term_years: fund?.term_years ? String(fund.term_years) : "",
    investment_period_years: fund?.investment_period_years ? String(fund.investment_period_years) : "",
    management_fee_rate: pct(fund?.management_fee_rate),
    carry_rate: pct(fund?.carry_rate),
    hurdle_rate: pct(fund?.hurdle_rate),
    primary_purpose: fund?.primary_purpose ?? "",
    primary_purpose_min_ratio: pct(fund?.primary_purpose_min_ratio),
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<{ message: string; existingId?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);

    const body = {
      name: values.name,
      fund_type: values.fund_type,
      strategy: values.strategy,
      target_amount: toAmount(values.target_amount),
      term_years: toYears(values.term_years),
      investment_period_years: toYears(values.investment_period_years),
      management_fee_rate: toRatio(values.management_fee_rate),
      carry_rate: toRatio(values.carry_rate),
      hurdle_rate: toRatio(values.hurdle_rate),
      primary_purpose: values.primary_purpose,
      primary_purpose_min_ratio: toRatio(values.primary_purpose_min_ratio),
      ...(fund ? {} : { gp_id: values.gp_id, status: values.status }),
    };
    const res = await fetch(fund ? `/api/v1/funds/${fund.id}` : "/api/v1/funds", {
      method: fund ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      router.push(`/funds/${data.data.id}`);
      router.refresh();
      return;
    }
    setErrors(data.error?.details?.fields ?? {});
    setFormError({ message: data.error?.message ?? "저장하지 못했습니다", existingId: data.error?.details?.existing_fund_id });
    setSaving(false);
  }

  const inputClass = (key: string) =>
    `mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 ${
      errors[key] ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-emerald-500 focus:ring-emerald-100"
    }`;
  const fieldError = (key: string) => (errors[key] ? <p className="mt-1 text-xs text-red-600">{errors[key]}</p> : null);
  const numberField = (key: "term_years" | "investment_period_years", label: string, unit: string) => (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="relative">
        <input inputMode="numeric" value={values[key]} onChange={(e) => set(key, e.target.value.replace(/[^0-9]/g, ""))} className={`${inputClass(key)} pr-10 text-right`} />
        <span className="pointer-events-none absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-slate-400">{unit}</span>
      </div>
      {fieldError(key)}
    </label>
  );
  const percentField = (key: "management_fee_rate" | "carry_rate" | "hurdle_rate" | "primary_purpose_min_ratio", label: string) => (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="relative">
        <input inputMode="decimal" value={values[key]} onChange={(e) => set(key, e.target.value.replace(/[^0-9.]/g, ""))} className={`${inputClass(key)} pr-8 text-right`} />
        <span className="pointer-events-none absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-slate-400">%</span>
      </div>
      {fieldError(key)}
    </label>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">기본 정보</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {!fund && (
            <>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">운용사</span>
                <select value={values.gp_id} onChange={(e) => set("gp_id", e.target.value)} className={inputClass("gp_id")}>
                  {(gps ?? []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                {fieldError("gp_id")}
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">현재 상태</span>
                <select value={values.status} onChange={(e) => set("status", e.target.value as "planning" | "fundraising")} className={inputClass("status")}>
                  <option value="planning">기획</option>
                  <option value="fundraising">모집 중</option>
                </select>
                <p className="mt-1 text-xs text-slate-500">결성 이후 상태는 등록 후 조합 화면에서 바꿉니다</p>
              </label>
            </>
          )}
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">조합명</span>
            <input value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="예: 그로스 2호 벤처투자조합" className={inputClass("name")} />
            {fieldError("name")}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">조합 유형</span>
            <select value={values.fund_type} onChange={(e) => set("fund_type", e.target.value as FundType)} className={inputClass("fund_type")}>
              {FUND_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FUND_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">분야</span>
            <select value={values.strategy} onChange={(e) => set("strategy", e.target.value as Strategy)} className={inputClass("strategy")}>
              {STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {STRATEGY_LABEL[s]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">출자 예산의 분야별 배분과 성과 분석의 기준입니다</p>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">목표 결성액</span>
            <AmountInput value={values.target_amount} onChange={(v) => set("target_amount", v)} invalid={!!errors.target_amount} placeholder="원 단위" />
            {fieldError("target_amount")}
          </label>
          <div className="grid grid-cols-2 gap-4">
            {numberField("term_years", "존속 기간", "년")}
            {numberField("investment_period_years", "투자 기간", "년")}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">주요 조건</h2>
        <p className="mt-1 text-xs text-slate-500">제안서·규약에 적힌 값. 모르면 비워 두고 나중에 채워도 됩니다.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {percentField("management_fee_rate", "관리보수율 (연)")}
          {percentField("carry_rate", "성과보수율")}
          {percentField("hurdle_rate", "기준수익률 (연)")}
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">주목적 투자 분야</span>
            <input value={values.primary_purpose} onChange={(e) => set("primary_purpose", e.target.value)} placeholder="예: 업력 7년 이내 기술 기반 창업기업" className={inputClass("primary_purpose")} />
            {fieldError("primary_purpose")}
          </label>
          {percentField("primary_purpose_min_ratio", "주목적 의무 비율")}
        </div>
      </section>

      {formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError.message}
          {formError.existingId && (
            <Link href={`/funds/${formError.existingId}`} className="ml-2 font-semibold underline">
              기존 조합 보기
            </Link>
          )}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Link href={fund ? `/funds/${fund.id}` : "/funds"} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          취소
        </Link>
        <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
          {saving ? "저장하는 중…" : fund ? "저장" : "등록"}
        </button>
      </div>
    </form>
  );
}
