import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatKRW, formatPercent } from "@/lib/format";
import { STRATEGY_LABEL } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getBoardProgram } from "@/lib/services/board";

export const metadata = { title: "공고 · VC ERP LP" };

// 공고 하나 (R8-1). 공고 조건은 지원하는 모든 GP에 같다. 선정된 GP와의 약속(선정 조건)은 따로 정한다 (L55)
export default async function BoardProgramPage(props: PageProps<"/board/[programId]">) {
  const me = (await getCurrentUser())!;
  const { programId } = await props.params;
  const p = await loadOrNotFound(() => getBoardProgram(programId));
  const mine = p.org_id === me.org_id;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/board" className="text-sm text-slate-500 hover:text-slate-700">
          ← 공고 게시판
        </Link>
        <p className="mt-2 text-sm font-medium text-slate-500">{p.org_name}</p>
        <h1 className="text-2xl font-bold text-slate-900">{p.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          접수 {formatDate(p.apply_start_date)} ~ {formatDate(p.apply_end_date)} ·{" "}
          {p.status === "reviewing" ? "접수 마감 · 심사 중" : p.days_left === 0 ? "오늘 마감" : `마감까지 ${p.days_left}일`}
          {mine && (
            <>
              {" · "}
              <Link href={`/programs/${p.id}`} className="text-emerald-700 hover:underline">
                우리 기관 출자사업 화면
              </Link>
            </>
          )}
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">모집 부문 · 공고 조건</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm tabular-nums">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-5 py-2.5">부문</th>
                <th className="px-5 py-2.5">분야</th>
                <th className="px-5 py-2.5 text-right">출자 예정액</th>
                <th className="px-5 py-2.5 text-right">선정 GP</th>
                <th className="px-5 py-2.5 text-right">최소 결성 규모</th>
                <th className="px-5 py-2.5 text-right">출자 비율 상한</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {p.tracks.map((t) => (
                <tr key={t.id}>
                  <td className="px-5 py-2.5 font-medium text-slate-900">{t.name}</td>
                  <td className="px-5 py-2.5 text-slate-600">{STRATEGY_LABEL[t.strategy]}</td>
                  <td className="px-5 py-2.5 text-right">{formatKRW(t.planned_amount)}</td>
                  <td className="px-5 py-2.5 text-right">{t.target_gp_count}곳</td>
                  <td className="px-5 py-2.5 text-right">{t.min_fund_size_amount ? formatKRW(t.min_fund_size_amount) : "제한 없음"}</td>
                  <td className="px-5 py-2.5 text-right">{t.max_commitment_ratio ? formatPercent(t.max_commitment_ratio) : "제한 없음"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          출자 비율 상한은 결성액 대비 이 기관의 출자 비율입니다. 예: 상한 40%에 30억을 출자받으려면 결성액이 75억 이상이어야 합니다. 선정되면 GP마다 출자 예정액 · 결성 기한 같은 선정 조건을 따로 정합니다.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">지원 방법</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
          <li>
            <b className="text-slate-800">이 서비스와 연동된 GP</b> — GP ERP의 &ldquo;출자사업 공고&rdquo;에서 조합을 골라 바로 지원합니다. 접수 기간은 이 기관이 지원을 받은 시각으로 봅니다 (L54).
          </li>
          <li>
            <b className="text-slate-800">연동되지 않은 GP</b> — {p.apply_guide ?? "이 기관이 접수 방법을 적지 않았습니다. 기관에 직접 문의하세요."}
          </li>
        </ul>
        {p.source === "external" && p.source_url && (
          <p className="mt-3 text-xs text-slate-500">
            외부 기관 공고입니다. 원문:{" "}
            <a href={p.source_url} className="text-emerald-700 hover:underline" target="_blank" rel="noreferrer">
              {p.source_url}
            </a>
          </p>
        )}
      </section>
    </div>
  );
}
