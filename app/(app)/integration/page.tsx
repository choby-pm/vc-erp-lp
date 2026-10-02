import Link from "next/link";
import { PullButton, RetryButton, SendPendingButton } from "@/components/integration-actions";
import NoPermission from "@/components/no-permission";
import { isAdmin } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { GP_EVENT_TYPE_LABEL, INBOUND_STATUS_LABEL, INBOUND_STATUS_STYLE, PROPOSAL_STATUS_LABEL, type InboundEventStatus } from "@/lib/labels";
import { listUnsentResponses } from "@/lib/gp/responses";
import { integrationOverview, listInboundEvents } from "@/lib/services/integration";

export const metadata = { title: "GP 연동 · VC ERP LP" };

const STATUSES: InboundEventStatus[] = ["received", "processed", "failed", "ignored"];
const TRIGGER_LABEL: Record<string, string> = { cron: "주기 작업", manual: "수동", auto: "웹훅 직후" };

// GP 연동 관리 (관리자, 05 API 설계 3-13). 연결 설정 자체는 운영자가 gp:link 스크립트로 넣는다
export default async function IntegrationPage(props: PageProps<"/integration">) {
  const me = (await getCurrentUser())!;
  if (!isAdmin(me.role)) return <NoPermission area="GP 연동 관리" role={me.role} />;

  const { status: raw } = await props.searchParams;
  const status = STATUSES.includes(raw as InboundEventStatus) ? (raw as InboundEventStatus) : null;
  const [overview, events, unsent] = await Promise.all([integrationOverview(me.org_id), listInboundEvents(me.org_id, status), listUnsentResponses(me.org_id)]);
  const { links, counts, job } = overview;
  const last = job?.last_result as { pulled?: { connection: string; stored: number; error?: string }[]; processed?: { processed: number; ignored: number; failed: number } } | null;
  const lastSummary = [
    ...(last?.pulled ?? []).map((p) => (p.error ? `${p.connection} 가져오기 실패` : `새로 저장 ${p.stored}건`)),
    ...(last?.processed ? [`처리 ${last.processed.processed} · 무시 ${last.processed.ignored} · 실패 ${last.processed.failed}`] : []),
  ].join(" · ");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-slate-900">GP 연동</h1>
          <p className="mt-1 text-sm text-slate-500">
            연동된 GP 시스템이 보내는 소식(웹훅)과 놓친 소식 가져오기. 받은 이벤트는 GP API로 다시 읽어 조합·제안·원장에 반영합니다.
          </p>
        </div>
        {links.length > 0 && <PullButton />}
      </div>

      {links.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          연동된 GP가 없습니다. 연동 설정은 서비스 운영자가 <code className="rounded bg-slate-100 px-1">npm run gp:link</code> 로 넣습니다.
        </div>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {links.map((l) => (
            <div key={l.gp_connection_id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">{l.connection_name}</h2>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${l.env_configured ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  {l.env_configured ? "설정 완료" : "환경 변수 없음"}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-[130px_1fr] gap-y-1.5 text-sm">
                <dt className="text-slate-500">운용사</dt>
                <dd>
                  <Link href={`/gps/${l.gp_id}`} className="font-medium text-slate-800 hover:text-emerald-700">
                    {l.gp_name}
                  </Link>
                </dd>
                <dt className="text-slate-500">GP의 우리 출자자</dt>
                <dd className="font-mono text-xs leading-5 text-slate-700">{l.gp_lp_id_prefix}…</dd>
                <dt className="text-slate-500">GP 주소 변수</dt>
                <dd className="font-mono text-xs leading-5 text-slate-700">{l.base_url_env}</dd>
                <dt className="text-slate-500">웹훅 받는 주소</dt>
                <dd className="break-all font-mono text-xs leading-5 text-slate-700">{l.webhook_path}</dd>
                <dt className="text-slate-500">연결</dt>
                <dd className="text-slate-700">{formatDateTime(l.linked_at)}</dd>
                <dt className="text-slate-500">마지막 가져오기</dt>
                <dd className="text-slate-700">{l.last_pulled_at ? formatDateTime(l.last_pulled_at) : "아직 없음"}</dd>
              </dl>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">받은 이벤트 (우리 기관 것만)</h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATUSES.map((s) => (
            <div key={s} className={`rounded-xl px-4 py-3 ${INBOUND_STATUS_STYLE[s]}`}>
              <dt className="text-xs">{INBOUND_STATUS_LABEL[s]}</dt>
              <dd className="text-xl font-bold tabular-nums">{counts[s]}</dd>
            </div>
          ))}
        </dl>
        {job?.last_started_at && (
          <p className="mt-3 text-sm text-slate-600">
            마지막 동기화 {formatDateTime(job.last_started_at)} · {TRIGGER_LABEL[job.last_trigger ?? "manual"]}
            {job.running
              ? " · 실행 중"
              : job.last_error
                ? ` · 오류: ${job.last_error}`
                : lastSummary && ` · ${lastSummary}`}
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          GP가 소식을 보내면 바로 받아 저장하고 GP API로 다시 읽어 반영합니다. 놓친 것은 하루 한 번 주기 작업이 가져와 처리하고, 위 버튼으로 지금 할 수도 있습니다. 실패하면 1분 → 5분 → 30분 → 2시간 → 12시간 뒤 다시 처리하고 5번 실패하면 멈춥니다. 연결 전에 GP에서 생긴 이벤트는 저장하지 않습니다
          (연결할 때 GP 데이터를 통째로 읽어 맞추므로).
        </p>
      </section>

      {/* GP에 보내지 못한 제안 응답 (BR-SYNC-11, BR-PROP-06) */}
      {unsent.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-amber-900">GP에 보내지 못한 제안 응답 {unsent.length}건</h2>
              <p className="mt-1 text-xs text-amber-800">
                GP에 닿지 못한 것은 주기 작업이 다시 보냅니다. GP가 거부한 것은 자동으로 다시 보내지 않으니 GP 담당자와 확인한 뒤 제안 화면에서 다시 보내세요.
              </p>
            </div>
            <SendPendingButton />
          </div>
          <ul className="mt-3 divide-y divide-amber-200 text-sm">
            {unsent.map((u) => (
              <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <Link href={`/proposals/${u.id}`} className="font-medium text-amber-950 hover:underline">
                    {u.fund_name}
                  </Link>
                  <span className="ml-2 text-amber-800">{PROPOSAL_STATUS_LABEL[u.status]}</span>
                  {u.gp_response_error_code === "GP_REJECTED" && <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">GP 거부</span>}
                </span>
                <span className="text-xs text-amber-800">
                  {u.gp_response_attempted_at ? `${formatDateTime(u.gp_response_attempted_at)} · ${u.gp_response_error ?? ""}` : "아직 시도 전"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="flex flex-wrap gap-2">
        {[null, ...STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/integration?status=${s}` : "/integration"}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              status === s ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s ? INBOUND_STATUS_LABEL[s] : "전체"}
          </Link>
        ))}
      </nav>

      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">받은 이벤트가 없습니다.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">GP에서 생긴 시각</th>
                <th className="px-4 py-3">이벤트</th>
                <th className="px-4 py-3">대상</th>
                <th className="px-4 py-3">받은 경로</th>
                <th className="px-4 py-3">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">{formatDateTime(e.occurred_at)}</td>
                  <td className="px-4 py-2.5">
                    <div className="text-slate-800">{GP_EVENT_TYPE_LABEL[e.event_type] ?? e.event_type}</div>
                    <div className="font-mono text-[11px] text-slate-400">{e.event_type}</div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{e.scope === "lp" ? "우리 출자자" : (e.fund_name ?? "조합 전체")}</td>
                  <td className="px-4 py-2.5 text-slate-600">{e.received_via === "webhook" ? "웹훅" : "가져오기"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${INBOUND_STATUS_STYLE[e.status]}`}>{INBOUND_STATUS_LABEL[e.status]}</span>
                    {e.last_error && <p className={`mt-1 text-xs ${e.status === "failed" ? "text-rose-600" : "text-slate-500"}`}>{e.last_error}</p>}
                    {e.status === "failed" && (
                      <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        시도 {e.attempts}회{e.attempts >= 5 ? " · 자동 재시도 멈춤" : ""} <RetryButton eventId={e.id} />
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
