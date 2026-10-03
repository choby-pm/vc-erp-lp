import Link from "next/link";
import CapitalCallTable from "@/components/capital-call-table";
import { NewCallForm } from "@/components/capital-call-actions";
import CommitmentActions from "@/components/commitment-actions";
import CommitmentLedger from "@/components/commitment-ledger";
import { ResyncButton } from "@/components/integration-actions";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, formatKRW, formatPercent } from "@/lib/format";
import {
  COMMITMENT_ORIGIN_LABEL,
  COMMITMENT_STATUS_LABEL,
  COMMITMENT_STATUS_STYLE,
  DATA_SOURCE_LABEL,
  FUND_STATUS_LABEL,
  RECON_STATUS_LABEL,
  RECON_STATUS_STYLE,
} from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { listCallsForCommitment } from "@/lib/services/capital-calls";
import { getLedger, listReconciliations } from "@/lib/services/commitment-ledger";
import { buildFormationCheck, getCommitment } from "@/lib/services/commitments";

export const metadata = { title: "출자 건 · VC ERP LP" };

const ENTRY_LABEL = { commitment: "약정", contribution: "납입", distribution: "분배" } as const;

// 출자 건 상세 (R3-6): 선정 조건 · 결성 정보 · 결성 확인표 · 약정(우리 장부 vs GP 원장 사본)
// + 장부 나란히 보기 · 약정 변경 · 대사 불일치 확인 · 대사 이력 (R3-6b)
export default async function CommitmentDetailPage(props: PageProps<"/commitments/[commitmentId]">) {
  const { commitmentId } = await props.params;
  const me = (await getCurrentUser())!;
  const c = await loadOrNotFound(() => getCommitment(me.org_id, commitmentId));
  const linked = c.data_source === "gp_api";
  const [ledger, history, calls] = await Promise.all([
    getLedger(me.org_id, commitmentId),
    linked ? listReconciliations(me.org_id, commitmentId) : Promise.resolve([]),
    listCallsForCommitment(me.org_id, commitmentId),
  ]);
  const called = calls.filter((x) => !x.cancelled_at).reduce((s, x) => s + x.call_amount, 0);
  const unfunded = c.commitment_amount - called;
  const canWrite = me.role === "admin" || me.role === "officer";

  const cards: [string, string][] = [
    ["약정액 (우리 장부)", c.commitment_amount ? formatKRW(c.commitment_amount) : "결성 확인 전"],
    ["GP 원장 사본 약정", linked ? formatKRW(c.gp_commitment_amount) : "대사 대상 아님"],
    ["결성일 · 결성액", c.formation_date ? `${formatDate(c.formation_date)} · ${formatKRW(c.fund_size_amount)}` : "결성 전"],
    ["결성 확인일", c.confirmed_date ? formatDate(c.confirmed_date) : "-"],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/commitments" className="text-sm text-slate-500 hover:text-slate-700">
          ← 출자 건
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{c.fund_name}</h1>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${COMMITMENT_STATUS_STYLE[c.status]}`}>{COMMITMENT_STATUS_LABEL[c.status]}</span>
          {linked && <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">GP 연동</span>}
          {linked && c.recon_status && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${RECON_STATUS_STYLE[c.recon_status]}`}>약정 대사 {RECON_STATUS_LABEL[c.recon_status]}</span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          <Link href={`/gps/${c.gp_id}`} className="hover:text-emerald-700">
            {c.gp_name}
          </Link>{" "}
          ·{" "}
          <Link href={`/funds/${c.fund_id}`} className="hover:text-emerald-700">
            조합 ({FUND_STATUS_LABEL[c.fund_status]} · {DATA_SOURCE_LABEL[c.data_source]})
          </Link>{" "}
          · {COMMITMENT_ORIGIN_LABEL[c.origin]}
          {c.proposal_id && (
            <>
              {" "}
              ·{" "}
              <Link href={`/proposals/${c.proposal_id}`} className="hover:text-emerald-700">
                출자 제안
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {c.origin === "selection" ? (
        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm">
          <h2 className="font-semibold text-slate-900">선정 조건</h2>
          <dl className="mt-2 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {[
              ["출자 예정액", formatKRW(c.planned_amount)],
              ["결성 기한", formatDate(c.formation_deadline)],
              ["출자 비율 상한", c.max_commitment_ratio === null ? "없음" : formatPercent(c.max_commitment_ratio)],
              ["최소 결성 규모 (부문)", c.track_min_fund_size_amount ? formatKRW(c.track_min_fund_size_amount) : "없음"],
              ["핵심 운용 인력 조건", c.key_person_condition ?? "없음"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-slate-100 py-1.5">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          이 시스템을 쓰기 전에 이미 출자한 연동 조합이라 제안·선정 조건이 없습니다. GP 약정으로 결성 확인합니다 (L19).
        </p>
      )}

      {linked && c.status === "awaiting_formation" && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <p>GP에서 조합이 결성되면(조합원 명부 확정 + 결성) 결성 정보와 GP 원장의 약정이 자동으로 들어와 아래 확인표가 채워집니다.</p>
          {canWrite && <ResyncButton fundId={c.fund_id} />}
        </div>
      )}

      {c.status === "awaiting_formation" && (
        <CommitmentActions
          commitmentId={c.id}
          linked={linked}
          canWrite={canWrite}
          initialCheck={buildFormationCheck(c, null)}
          fundFormation={{ fund_size_amount: c.fund_size_amount, formation_date: c.formation_date }}
        />
      )}

      {c.status === "cancelled" && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {formatDate(c.cancelled_date)} 선정 취소 — {c.cancel_reason}
        </p>
      )}

      {(c.status === "active" || calls.length > 0) && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              캐피탈콜 <span className="font-normal text-slate-500">· 요청 합계 {formatKRW(called)} · 남은 약정 {formatKRW(unfunded)}</span>
            </h2>
            {canWrite && !linked && c.status === "active" && (
              <NewCallForm commitmentId={c.id} nextNo={Math.max(0, ...calls.map((x) => x.call_no)) + 1} unfunded={unfunded} />
            )}
          </div>
          {calls.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">{linked ? "GP에서 받은 캐피탈콜이 없습니다. GP가 발송하면 자동으로 들어옵니다." : "입력한 캐피탈콜이 없습니다."}</p>
          ) : (
            <CapitalCallTable calls={calls} showFund={false} canCancel={canWrite && !linked} />
          )}
        </section>
      )}

      {c.status !== "cancelled" && <CommitmentLedger commitmentId={c.id} ledger={ledger} canWrite={canWrite} active={c.status === "active"} />}

      {linked && history.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">대사 이력 (추가만 되는 기록, 위가 최신)</h2>
          <ol className="divide-y divide-slate-100">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-2.5 text-sm">
                <span className="text-slate-800">
                  {ENTRY_LABEL[h.entry_type]}{" "}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RECON_STATUS_STYLE[h.recon_status]}`}>{RECON_STATUS_LABEL[h.recon_status]}</span>{" "}
                  <span className="tabular-nums text-slate-600">
                    우리 {formatKRW(h.our_amount)} · GP {formatKRW(h.gp_amount)}
                  </span>
                  {h.resolution_memo && <span className="ml-2 text-slate-500">— {h.resolution_memo}</span>}
                </span>
                <span className="text-xs text-slate-500">
                  {h.resolved_by_name ? `${h.resolved_by_name} · ` : ""}
                  {formatDateTime(h.checked_at)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
