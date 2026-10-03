"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatDate, formatKRW } from "@/lib/format";
import { RECON_STATUS_LABEL, RECON_STATUS_STYLE } from "@/lib/labels";
import type { LedgerRow, LedgerTotal, LedgerView } from "@/lib/services/commitment-ledger";

// 장부 나란히 보기 · 대사 불일치 확인 · 약정 변경 (R3-6b, BR-CMT-06, BR-REC-04·05)

const ENTRY_LABEL = { commitment: "약정", contribution: "납입", distribution: "분배" } as const;

async function send(url: string, body: unknown, idempotencyKey?: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fields = data.error?.details?.fields as Record<string, string> | undefined;
    throw new Error(fields ? Object.values(fields).join(" · ") : (data.error?.message ?? "처리하지 못했습니다"));
  }
  return data.data;
}

function ReconBadge({ t }: { t: LedgerTotal }) {
  if (t.gp_amount === null) return <span className="text-xs text-slate-400">대사 대상 아님</span>;
  if (!t.recon) return <span className="text-xs text-slate-400">{t.our_amount === 0 && t.gp_amount === 0 ? "기록 없음" : "대사 전"}</span>;
  if (t.recon.waiting) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">확인 대기</span>;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RECON_STATUS_STYLE[t.recon.recon_status]}`}>{RECON_STATUS_LABEL[t.recon.recon_status]}</span>;
}

function ResolveForm({ reconId }: { reconId: string }) {
  const router = useRouter();
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="확인 사유 (예: GP 입금 확인 지연, 다음 주 반영 예정)" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            await send(`/api/v1/reconciliations/${reconId}/resolve`, { resolution_memo: memo });
            router.refresh();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setPending(false);
          }
        }}
        className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
      >
        불일치 확인
      </button>
      {error && <p role="alert" className="w-full text-xs text-rose-700">{error}</p>}
    </div>
  );
}

function AdjustForm({ commitmentId, current, suggested }: { commitmentId: string; current: number; suggested: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ amount: suggested && suggested !== current ? String(suggested) : "", date: "", memo: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const key = useRef(crypto.randomUUID());

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-emerald-700 hover:underline">
        약정 변경
      </button>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs text-slate-600">
        지금 약정 {formatKRW(current)}을 취소 행으로 지우고 새 금액을 넣습니다 (BR-CMT-06).
        {suggested !== null && suggested !== current && ` GP 원장 사본의 약정은 ${formatKRW(suggested)}입니다.`}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">새 약정액</span>
          <AmountInput value={v.amount} onChange={(x) => setV({ ...v, amount: x })} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">변경일</span>
          <input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">변경 사유</span>
          <input value={v.memo} onChange={(e) => setV({ ...v, memo: e.target.value })} placeholder="예: 규약 변경 안건 가결" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
          취소
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            try {
              await send(`/api/v1/commitments/${commitmentId}/commitment-adjustments`, { new_amount: toAmount(v.amount), entry_date: v.date, memo: v.memo }, key.current);
              setOpen(false);
              router.refresh();
            } catch (err) {
              key.current = crypto.randomUUID();
              setError((err as Error).message);
            } finally {
              setPending(false);
            }
          }}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          저장
        </button>
      </div>
    </div>
  );
}

function Rows({ rows, empty }: { rows: LedgerRow[]; empty: string }) {
  if (rows.length === 0) return <p className="px-4 py-6 text-center text-sm text-slate-400">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.id} className={`flex items-baseline justify-between gap-3 px-4 py-2 text-sm ${r.reversed ? "text-slate-400 line-through" : ""}`}>
          <span>
            <span className="text-xs text-slate-500">{formatDate(r.entry_date)}</span>{" "}
            <span className="font-medium">{ENTRY_LABEL[r.entry_type]}</span> <span className="text-xs text-slate-500">{r.is_reversal ? `${r.label} 취소` : r.label}</span>
            {r.memo && !r.is_reversal && <span className="block text-xs text-slate-500">{r.memo}</span>}
          </span>
          <span className={`tabular-nums ${r.amount < 0 ? "text-rose-600" : ""}`}>{formatKRW(r.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function CommitmentLedger({
  commitmentId,
  ledger,
  canWrite,
  active,
}: {
  commitmentId: string;
  ledger: LedgerView;
  canWrite: boolean;
  active: boolean;
}) {
  const commitment = ledger.totals.find((t) => t.entry_type === "commitment")!;
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">장부 {ledger.gp ? "· GP 원장 사본과 대사" : "(수기 조합: 대사 대상 아님)"}</h2>
        {canWrite && active && <AdjustForm commitmentId={commitmentId} current={commitment.our_amount} suggested={commitment.gp_amount} />}
      </div>

      {/* 구분별 합계 · 대사 */}
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
          <tr>
            <th className="py-2">구분</th>
            <th className="py-2 text-right">우리 장부</th>
            {ledger.gp && <th className="py-2 text-right">GP 원장 사본</th>}
            <th className="py-2 pl-4">대사</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ledger.totals.map((t) => (
            <tr key={t.entry_type} className="align-top">
              <td className="py-2 font-medium text-slate-800">{ENTRY_LABEL[t.entry_type]}</td>
              <td className="py-2 text-right tabular-nums">{formatKRW(t.our_amount)}</td>
              {ledger.gp && <td className="py-2 text-right tabular-nums">{formatKRW(t.gp_amount)}</td>}
              <td className="py-2 pl-4">
                <ReconBadge t={t} />
                {t.recon?.recon_status === "mismatched" && (
                  <p className="mt-1 text-xs text-slate-500">
                    차이 {formatKRW(t.recon.our_amount - t.recon.gp_amount)}
                    {t.recon.waiting ? " · 생긴 지 7일 안이라 확인 대기 (BR-REC-04)" : ""}
                  </p>
                )}
                {t.recon?.recon_status === "resolved" && t.recon.resolution_memo && <p className="mt-1 text-xs text-slate-500">확인: {t.recon.resolution_memo}</p>}
                {canWrite && t.recon?.recon_status === "mismatched" && <ResolveForm reconId={t.recon.reconciliation_id} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 행 나란히 */}
      <div className={`grid gap-4 ${ledger.gp ? "lg:grid-cols-2" : ""}`}>
        <div className="rounded-xl border border-slate-200">
          <h3 className="border-b border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500">우리 장부</h3>
          <Rows rows={ledger.ours} empty="결성 확인 전이라 기록이 없습니다" />
        </div>
        {ledger.gp && (
          <div className="rounded-xl border border-sky-200">
            <h3 className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-800">GP 원장 사본 (받은 그대로)</h3>
            <Rows rows={ledger.gp} empty="GP 원장에 아직 기록이 없습니다" />
          </div>
        )}
      </div>
    </section>
  );
}
