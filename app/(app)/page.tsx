import Link from "next/link";
import { BudgetChart, CashChart, VintageChart } from "@/components/dashboard-charts";
import { multiple, pct } from "@/components/performance-card";
import { getCurrentUser } from "@/lib/auth/session";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { formatDate, formatKRW } from "@/lib/format";
import { STRATEGY_LABEL } from "@/lib/labels";
import type { AlertGroup } from "@/lib/services/alerts";
import { getDashboard, type ScheduleKind } from "@/lib/services/dashboard";

export const metadata = { title: "대시보드 · VC ERP LP" };

const TONE: Record<AlertGroup["tone"], { box: string; badge: string }> = {
  red: { box: "border-rose-200", badge: "bg-rose-100 text-rose-700" },
  amber: { box: "border-amber-200", badge: "bg-amber-100 text-amber-800" },
  sky: { box: "border-sky-200", badge: "bg-sky-100 text-sky-700" },
  slate: { box: "border-slate-200", badge: "bg-slate-100 text-slate-700" },
};

const KIND: Record<ScheduleKind, { label: string; cls: string }> = {
  call_due: { label: "납입 기한", cls: "bg-rose-50 text-rose-700" },
  meeting: { label: "총회", cls: "bg-violet-50 text-violet-700" },
  distribution: { label: "분배", cls: "bg-emerald-50 text-emerald-700" },
  formation_deadline: { label: "결성 기한", cls: "bg-amber-50 text-amber-800" },
  program_close: { label: "접수 마감", cls: "bg-sky-50 text-sky-700" },
  report_due: { label: "보고 기한", cls: "bg-slate-100 text-slate-700" },
};

const dday = (today: string, d: string) => {
  const n = Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000);
  return n === 0 ? "오늘" : `D-${n}`;
};

function Card({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block rounded-2xl border border-slate-200 bg-white p-5 hover:border-emerald-300">
      <p className="text-xs font-medium text-slate-500">{title}</p>
      {children}
    </Link>
  );
}

// 대시보드 (R5-4 주의 목록 + R7-1 숫자 · 30일 일정 + R7-2 차트). L45 배치: 숫자 카드 → 주의 목록 → 30일 일정 → 차트
// 저장하지 않고 열 때마다 계산한다. 숫자는 예산 · 성과 · 자금 계획 화면과 같은 함수 (04 14장)
export default async function Home() {
  const user = (await getCurrentUser())!;
  const d = await getDashboard(user.org_id, user);
  const groups = d.alerts;
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  const urgent = groups.filter((g) => g.tone === "red").reduce((s, g) => s + g.items.length, 0);
  const b = d.budget;
  const t = d.portfolio;
  const usedPct = b && b.total_amount > 0 ? Math.min(100, (b.used_amount / b.total_amount) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">대시보드</h1>
        <p className="mt-1 text-sm text-slate-500">
          {user.org_name} · {user.name} ({ROLE_LABEL[user.role]}) · {formatDate(d.today)} 기준
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`${d.today.slice(0, 4)}년 출자 예산`} href={b ? `/budgets/${b.id}` : "/budgets"}>
          {b ? (
            <>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                {formatKRW(b.used_amount)} <span className="text-sm font-normal text-slate-500">/ {formatKRW(b.total_amount)}</span>
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${usedPct}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                사용 {usedPct.toFixed(0)}% · 잔액 {formatKRW(b.remaining_amount)} · 사용 = 선정 + 선정 결재 대기
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
                {b.strategies
                  .filter((s) => s.allocated_amount > 0 || s.used_amount > 0)
                  .map((s) => (
                    <li key={s.strategy} className="flex justify-between tabular-nums">
                      <span>{STRATEGY_LABEL[s.strategy]}</span>
                      <span>
                        {formatKRW(s.used_amount)} / {s.allocated_amount > 0 ? formatKRW(s.allocated_amount) : "배분 없음"}
                      </span>
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">올해 예산이 없습니다</p>
          )}
        </Card>

        <Card title="포트폴리오 성과 · 우리 장부" href="/performance">
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            TVPI {multiple(t.tvpi)} <span className="text-base font-semibold text-slate-600">· IRR {pct(t.irr)}</span>
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs tabular-nums text-slate-500">
            <dt>출자 건</dt>
            <dd className="text-right">{t.count}건</dd>
            <dt>약정</dt>
            <dd className="text-right">{formatKRW(t.commitment_amount)}</dd>
            <dt>누적 납입</dt>
            <dd className="text-right">{formatKRW(t.contribution_amount)}</dd>
            <dt>누적 분배</dt>
            <dd className="text-right">{formatKRW(t.distribution_amount)}</dd>
            <dt>평가액 (조정)</dt>
            <dd className="text-right">{formatKRW(t.nav_amount)}</dd>
          </dl>
          {t.nav_missing_count > 0 && <p className="mt-1 text-xs text-amber-700">평가액 없는 출자 건 {t.nav_missing_count}건 (실제보다 낮게 나옴)</p>}
        </Card>

        <Card title={`이번 달 납입 예정 · ${Number(d.cash.month.slice(5, 7))}월`} href="/cash-plan">
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{formatKRW(d.cash.this_month?.total ?? 0)}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs tabular-nums text-slate-500">
            <dt>확정 (받은 캐피탈콜)</dt>
            <dd className="text-right">{formatKRW(d.cash.this_month?.confirmed ?? 0)}</dd>
            <dt>추정 (남은 약정 고르게)</dt>
            <dd className="text-right">{formatKRW(d.cash.this_month?.estimated ?? 0)}</dd>
            <dt>앞으로 12개월</dt>
            <dd className="text-right">{formatKRW(d.cash.months.reduce((x, m) => x + m.total, 0))}</dd>
          </dl>
          {d.cash.overdue_unpaid > 0 && <p className="mt-1 text-xs text-rose-700">기한 지난 미납 {formatKRW(d.cash.overdue_unpaid)}</p>}
        </Card>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">주의 목록</h2>
          <p className="text-sm text-slate-500">{total === 0 ? "처리할 일이 없습니다" : `처리할 일 ${total}건${urgent ? ` · 급한 것 ${urgent}건` : ""}`}</p>
        </div>
        {groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">결재·납입·보고·투표 모두 처리할 것이 없습니다.</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.map((g) => (
              <section key={g.key} className={`rounded-2xl border bg-white ${TONE[g.tone].box}`}>
                <h3 className="flex items-center justify-between border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">
                  {g.label}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[g.tone].badge}`}>{g.items.length}</span>
                </h3>
                <ul className="divide-y divide-slate-100">
                  {g.items.slice(0, 6).map((it, i) => (
                    <li key={i}>
                      <Link href={it.href} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm hover:bg-slate-50">
                        <span className="min-w-0">
                          <span className="font-medium text-slate-900">{it.title}</span>
                          <span className="block text-xs text-slate-500">{it.detail}</span>
                        </span>
                        {it.date && <span className="shrink-0 text-xs text-slate-400">{formatDate(it.date)}</span>}
                      </Link>
                    </li>
                  ))}
                  {g.items.length > 6 && <li className="px-5 py-2 text-xs text-slate-400">외 {g.items.length - 6}건</li>}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-5 py-3 text-lg font-semibold text-slate-900">
          30일 일정 <span className="text-sm font-normal text-slate-500">오늘부터 30일 · {d.schedule.length}건</span>
        </h2>
        {d.schedule.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">30일 안에 기한·예정일이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.schedule.map((it, i) => (
              <li key={i}>
                <Link href={it.href} className="flex items-center gap-4 px-5 py-2.5 text-sm hover:bg-slate-50">
                  <span className="w-24 shrink-0 tabular-nums text-slate-600">
                    {formatDate(it.date)}
                    <span className="block text-xs text-slate-400">{dday(d.today, it.date)}</span>
                  </span>
                  <span className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${KIND[it.kind].cls}`}>{KIND[it.kind].label}</span>
                  <span className="min-w-0">
                    <span className="font-medium text-slate-900">{it.title}</span>
                    <span className="block text-xs text-slate-500">{it.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <BudgetChart year={Number(d.today.slice(0, 4))} strategies={b?.strategies ?? null} />
        <CashChart months={d.cash.months} />
        <VintageChart groups={d.vintages} />
      </div>
    </div>
  );
}
