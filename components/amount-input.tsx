"use client";

import { formatKRW } from "@/lib/format";

// 원 단위 금액 입력칸. 숫자만 받아 쉼표를 붙여 보여주고, 아래에 "= 30억 원" 처럼 읽기 쉬운 값을 표시한다
// value 는 숫자만 담은 문자열 ("" = 비어 있음)

export default function AmountInput({
  value,
  onChange,
  invalid,
  ...props
}: { value: string; onChange: (digits: string) => void; invalid?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const amount = Number(value);
  return (
    <>
      <input
        inputMode="numeric"
        value={value === "" ? "" : amount.toLocaleString("ko-KR")}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-right text-sm tabular-nums text-slate-900 outline-none focus:ring-2 ${
          invalid ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-emerald-500 focus:ring-emerald-100"
        }`}
        {...props}
      />
      {amount > 0 && <p className="mt-1 text-right text-xs text-slate-500">= {formatKRW(amount)}</p>}
    </>
  );
}

// 입력 문자열 → API 금액 (비어 있으면 null)
export const toAmount = (digits: string) => (digits === "" ? null : Number(digits));
