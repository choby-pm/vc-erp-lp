"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { GP_TYPES, GP_TYPE_LABEL, type GpType } from "@/lib/labels";
import type { GpDetail } from "@/lib/services/gps";

// 운용사 등록·수정 공용 폼 (🔗 GP components/lp-form.tsx 와 같은 방식)

type Errors = Record<string, string>;

export default function GpForm({ gp }: { gp?: GpDetail }) {
  const router = useRouter();
  const [values, setValues] = useState({
    name: gp?.name ?? "",
    gp_type: (gp?.gp_type ?? "venture_capital") as GpType,
    aum_amount: gp?.aum_amount ? String(gp.aum_amount) : "",
    contact_name: gp?.contact_name ?? "",
    contact_email: gp?.contact_email ?? "",
    contact_phone: gp?.contact_phone ?? "",
    memo: gp?.memo ?? "",
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

    const res = await fetch(gp ? `/api/v1/gps/${gp.id}` : "/api/v1/gps", {
      method: gp ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, aum_amount: toAmount(values.aum_amount) }),
    });
    const body = await res.json().catch(() => ({}));

    if (res.ok) {
      router.push(`/gps/${body.data.id}`);
      router.refresh();
      return;
    }
    setErrors(body.error?.details?.fields ?? {});
    setFormError({ message: body.error?.message ?? "저장하지 못했습니다", existingId: body.error?.details?.existing_gp_id });
    setSaving(false);
  }

  const inputClass = (key: string) =>
    `mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 ${
      errors[key] ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-emerald-500 focus:ring-emerald-100"
    }`;
  const fieldError = (key: string) => (errors[key] ? <p className="mt-1 text-xs text-red-600">{errors[key]}</p> : null);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">기본 정보</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">운용사명</span>
            <input value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="예: 그로스벤처스" className={inputClass("name")} />
            {fieldError("name")}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">유형</span>
            <select value={values.gp_type} onChange={(e) => set("gp_type", e.target.value as GpType)} className={inputClass("gp_type")}>
              {GP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {GP_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            {fieldError("gp_type")}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">운용 규모 (선택)</span>
            <AmountInput value={values.aum_amount} onChange={(v) => set("aum_amount", v)} invalid={!!errors.aum_amount} placeholder="원 단위" />
            {fieldError("aum_amount")}
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">GP 담당자</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">이름</span>
            <input value={values.contact_name} onChange={(e) => set("contact_name", e.target.value)} className={inputClass("contact_name")} />
            {fieldError("contact_name")}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">이메일</span>
            <input type="email" value={values.contact_email} onChange={(e) => set("contact_email", e.target.value)} className={inputClass("contact_email")} />
            {fieldError("contact_email")}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">전화번호</span>
            <input value={values.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} placeholder="02-1234-5678" className={inputClass("contact_phone")} />
            {fieldError("contact_phone")}
          </label>
        </div>
        <label className="mt-4 block">
          <span className="text-sm font-medium text-slate-700">내부 메모</span>
          <textarea value={values.memo} onChange={(e) => set("memo", e.target.value)} rows={3} className={inputClass("memo")} />
          <p className="mt-1 text-xs text-slate-500">우리 기관 내부용입니다. GP에 보내지 않고, 다른 기관에도 보이지 않습니다.</p>
          {fieldError("memo")}
        </label>
      </section>

      {formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError.message}
          {formError.existingId && (
            <Link href={`/gps/${formError.existingId}`} className="ml-2 font-semibold underline">
              기존 운용사 보기
            </Link>
          )}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Link href={gp ? `/gps/${gp.id}` : "/gps"} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          취소
        </Link>
        <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
          {saving ? "저장하는 중…" : gp ? "저장" : "등록"}
        </button>
      </div>
    </form>
  );
}
