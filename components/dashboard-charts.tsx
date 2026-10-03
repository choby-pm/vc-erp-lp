import { multiple } from "@/components/performance-card";
import { formatKRW } from "@/lib/format";
import { STRATEGY_LABEL } from "@/lib/labels";
import type { BudgetStrategyRow } from "@/lib/services/budgets";
import type { CashPlanMonth } from "@/lib/services/cash-plan";
import type { MetricRow } from "@/lib/services/performance";

// 대시보드 차트 (R7-2, L44): 라이브러리 없이 막대만. 마우스를 올리면 금액이 보인다 (title)
// 숫자는 대시보드 데이터를 그대로 쓴다 (예산 · 자금 계획 · 성과 화면과 같은 함수)

function Frame({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

const Legend = ({ items }: { items: [string, string][] }) => (
  <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
    {items.map(([cls, label]) => (
      <span key={label} className="flex items-center gap-1">
        <span className={`inline-block h-2.5 w-2.5 rounded-sm ${cls}`} />
        {label}
      </span>
    ))}
  </div>
);

const Empty = ({ children }: { children: React.ReactNode }) => <p className="py-8 text-center text-sm text-slate-400">{children}</p>;

// ① 분야별 예산: 배분(회색 바탕) 대비 사용(초록). 배분이 없으면 사용만
export function BudgetChart({ year, strategies }: { year: number; strategies: BudgetStrategyRow[] | null }) {
  const rows = (strategies ?? []).filter((s) => s.allocated_amount > 0 || s.used_amount > 0);
  const max = Math.max(1, ...rows.map((s) => Math.max(s.allocated_amount, s.used_amount)));
  return (
    <Frame title={`${year}년 분야별 예산`} note="배분 대비 사용 (선정 + 선정 결재 대기)">
      {rows.length === 0 ? (
        <Empty>{strategies ? "분야별 배분·사용이 없습니다" : "올해 예산이 없습니다"}</Empty>
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => {
            const over = s.allocated_amount > 0 && s.used_amount > s.allocated_amount;
            return (
              <li key={s.strategy} title={`${STRATEGY_LABEL[s.strategy]} · 사용 ${formatKRW(s.used_amount)} / 배분 ${s.allocated_amount ? formatKRW(s.allocated_amount) : "없음"}`}>
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700">{STRATEGY_LABEL[s.strategy]}</span>
                  <span className={`tabular-nums ${over ? "text-rose-700" : "text-slate-500"}`}>
                    {formatKRW(s.used_amount)} / {s.allocated_amount ? formatKRW(s.allocated_amount) : "배분 없음"}
                  </span>
                </div>
                <div className="relative mt-1 h-3 rounded-full bg-slate-100">
                  {s.allocated_amount > 0 && <div className="absolute inset-y-0 left-0 rounded-full bg-slate-200" style={{ width: `${(s.allocated_amount / max) * 100}%` }} />}
                  <div className={`absolute inset-y-0 left-0 rounded-full ${over ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${(s.used_amount / max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 0 && <Legend items={[["bg-slate-200", "배분"], ["bg-emerald-500", "사용"], ["bg-rose-500", "배분 초과"]]} />}
    </Frame>
  );
}

// ② 월별 납입 예정: 확정(받은 캐피탈콜) 위에 추정(남은 약정을 투자 기간 끝까지 고르게)을 쌓는다
export function CashChart({ months }: { months: CashPlanMonth[] }) {
  const max = Math.max(1, ...months.map((m) => m.total));
  const sum = months.reduce((s, m) => s + m.total, 0);
  return (
    <Frame title="월별 납입 예정 · 12개월" note={`${months[0]?.month.replace("-", ".")} ~ ${months[months.length - 1]?.month.replace("-", ".")} · 합계 ${formatKRW(sum)} · 자금 계획과 같은 계산`}>
      {sum === 0 ? (
        <Empty>앞으로 12개월 납입 예정이 없습니다</Empty>
      ) : (
        <div className="flex h-40 items-end gap-1">
          {months.map((m) => (
            <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end" title={`${m.month} · 확정 ${formatKRW(m.confirmed)} · 추정 ${formatKRW(m.estimated)}`}>
              <div className="flex w-full flex-col justify-end" style={{ height: `${(m.total / max) * 100}%` }}>
                {m.estimated > 0 && <div className="w-full rounded-t bg-sky-200" style={{ height: `${(m.estimated / m.total) * 100}%` }} />}
                {m.confirmed > 0 && <div className={`w-full bg-sky-600 ${m.estimated > 0 ? "" : "rounded-t"}`} style={{ height: `${(m.confirmed / m.total) * 100}%` }} />}
              </div>
              <span className="mt-1 whitespace-nowrap text-[10px] tabular-nums text-slate-400">{Number(m.month.slice(5, 7))}</span>
            </div>
          ))}
        </div>
      )}
      <Legend items={[["bg-sky-600", "확정 (받은 캐피탈콜)"], ["bg-sky-200", "추정"]]} />
    </Frame>
  );
}

// ③ 빈티지별 TVPI: 1.0x 기준선. 납입이 없는 빈티지는 막대 없이 "-"
export function VintageChart({ groups }: { groups: MetricRow[] }) {
  const max = Math.max(1.5, ...groups.map((g) => g.tvpi ?? 0));
  return (
    <Frame title="빈티지별 TVPI" note="(분배 + 조정 평가액) ÷ 납입 · 성과 화면과 같은 계산">
      {groups.length === 0 ? (
        <Empty>활성·청산 출자 건이 없습니다</Empty>
      ) : (
        <div className="relative flex h-40 items-end gap-3 border-b border-slate-200">
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-300" style={{ bottom: `${(1 / max) * 100}%` }}>
            <span className="absolute -top-4 right-0 text-[10px] text-slate-400">1.0x</span>
          </div>
          {groups.map((g) => (
            <div key={g.key} className="flex h-full flex-1 flex-col items-center justify-end" title={`${g.label} · ${g.count}건 · TVPI ${multiple(g.tvpi)} · 납입 ${formatKRW(g.contribution_amount)}`}>
              <span className="mb-1 text-xs font-semibold tabular-nums text-slate-700">{multiple(g.tvpi)}</span>
              {g.tvpi !== null && <div className="w-full max-w-12 rounded-t bg-violet-500" style={{ height: `${(g.tvpi / max) * 100}%` }} />}
            </div>
          ))}
        </div>
      )}
      {groups.length > 0 && (
        <div className="mt-1 flex gap-3">
          {groups.map((g) => (
            <span key={g.key} className="flex-1 text-center text-[11px] text-slate-500">
              {g.label}
              <span className="block text-slate-400">{g.count}건</span>
            </span>
          ))}
        </div>
      )}
    </Frame>
  );
}
