import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatKRW } from "@/lib/format";
import { STRATEGIES, STRATEGY_LABEL, type Strategy } from "@/lib/labels";
import { listBoard } from "@/lib/services/board";

export const metadata = { title: "공고 게시판 · VC ERP LP" };

const dday = (n: number | null, status: string) => (status === "reviewing" ? "심사 중" : n === null ? "-" : n === 0 ? "오늘 마감" : n < 0 ? "마감" : `D-${n}`);

// 출자사업 공고 게시판 (R8-1, L50·L51): 이 서비스를 쓰는 모든 기관의 접수 중 · 심사 중 공고
// 기관 분리의 예외 — 공고 항목만 보인다. 연동 GP도 GP ERP에서 같은 목록을 본다
export default async function BoardPage(props: PageProps<"/board">) {
  const me = (await getCurrentUser())!;
  const sp = await props.searchParams;
  const strategy = STRATEGIES.find((s) => s === sp.strategy) as Strategy | undefined;
  const all = await listBoard({});
  const items = strategy ? all.filter((p) => p.tracks.some((t) => t.strategy === strategy)) : all;
  const orgs = new Set(all.map((p) => p.org_id)).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">공고 게시판</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          이 서비스를 쓰는 기관 {orgs}곳의 접수 중 · 심사 중 출자사업 공고입니다. 연동된 GP는 GP ERP에서 바로 지원하고, 연동되지 않은 GP는 각 공고의 접수 방법대로 지원합니다.
          다른 기관 공고는 공고 내용만 보이고 예산 · 접수 현황은 보이지 않습니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {[undefined, ...STRATEGIES].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/board?strategy=${s}` : "/board"}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${strategy === s ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {s ? STRATEGY_LABEL[s] : "전체 분야"}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          {strategy ? `${STRATEGY_LABEL[strategy]} 분야 부문이 있는 공고가 없습니다.` : "지금 접수 중인 공고가 없습니다."}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((p) => {
            const mine = p.org_id === me.org_id;
            const total = p.tracks.reduce((s, t) => s + t.planned_amount, 0);
            const urgent = p.status === "open" && p.days_left !== null && p.days_left <= 7;
            return (
              <li key={p.id}>
                <Link href={`/board/${p.id}`} className="block rounded-2xl border border-slate-200 bg-white p-5 hover:border-emerald-300">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">
                        {p.org_name}
                        {mine && <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">우리 기관</span>}
                      </p>
                      <h2 className="mt-0.5 text-base font-semibold text-slate-900">{p.name}</h2>
                      <p className="mt-1 text-xs text-slate-500">
                        접수 {formatDate(p.apply_start_date)} ~ {formatDate(p.apply_end_date)} · 부문 {p.tracks.length}개 · 출자 예정 합계 {formatKRW(total)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                        p.status === "reviewing" ? "bg-slate-100 text-slate-600" : urgent ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {dday(p.days_left, p.status)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.tracks.map((t) => (
                      <span key={t.id} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                        {t.name} · {STRATEGY_LABEL[t.strategy]} · {formatKRW(t.planned_amount)} · {t.target_gp_count}곳
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-slate-400">공고는 GP를 뽑는 절차입니다. 다른 LP는 공고에 지원하지 않고, 선정된 GP가 개별 출자 제안으로 나머지 출자자를 모읍니다 ⚠️.</p>
    </div>
  );
}
