import Link from "next/link";
import { ManualResultsForm, VotePanel } from "@/components/meeting-actions";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/format";
import { MEETING_TYPE_LABEL, SUBMIT_STATUS_LABEL, SUBMIT_STATUS_STYLE } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getMeeting } from "@/lib/services/meetings";

export const metadata = { title: "총회 · VC ERP LP" };

// 총회 상세 (R5-3): 안건 · 검토 의견 · 찬반 · 투표 결재 · GP 제출 · 결과
export default async function MeetingDetailPage(props: PageProps<"/meetings/[meetingId]">) {
  const { meetingId } = await props.params;
  const me = (await getCurrentUser())!;
  const m = await loadOrNotFound(() => getMeeting(me.org_id, meetingId));
  const canWrite = me.role === "admin" || me.role === "officer";
  const linked = m.data_source === "gp_api";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/meetings" className="text-sm text-slate-500 hover:text-slate-700">
          ← 총회
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">
            {m.fund_name} · {MEETING_TYPE_LABEL[m.meeting_type] ?? m.meeting_type}
          </h1>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SUBMIT_STATUS_STYLE[m.submit_status]}`}>{SUBMIT_STATUS_LABEL[m.submit_status]}</span>
          {linked ? <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">GP 연동</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">수기</span>}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {m.gp_name} · 총회일 {formatDate(m.meeting_date)}
          {m.location && ` · ${m.location}`} · {m.status === "scheduled" ? (m.can_vote ? "투표 받는 중" : "투표 마감") : m.status === "held" ? "개최 완료" : "취소"} ·{" "}
          <Link href={`/funds/${m.fund_id}`} className="text-emerald-700 hover:underline">
            조합
          </Link>
          {m.latest_approval && (
            <>
              {" "}
              ·{" "}
              <Link href={`/approvals/${m.latest_approval.id}`} className="text-emerald-700 hover:underline">
                투표 결재
              </Link>
            </>
          )}
        </p>
      </div>

      {m.submit_status === "failed" && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          GP가 투표 제출을 거부했습니다 ({formatDateTime(m.vote_submit_attempted_at)}): {m.vote_submit_error}. 이미 투표가 닫혔다면 GP 담당자와 확인하세요 (BR-VOTE-06).
        </p>
      )}
      {m.submit_status === "approved_unsent" && linked && m.vote_submit_error && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          승인된 투표를 아직 GP에 보내지 못했습니다 ({m.vote_submit_error}). 주기 작업이 다시 보냅니다.
        </p>
      )}
      {m.latest_approval?.status === "approved" && !m.latest_approval.approved_matches && m.submit_status !== "submitted" && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">승인된 결재 뒤에 찬반이 바뀌었습니다. 제출하려면 다시 기안하세요 (BR-VOTE-05).</p>
      )}

      <VotePanel meeting={m} canWrite={canWrite} />

      {canWrite && !linked && m.status === "scheduled" && <ManualResultsForm meeting={m} />}
    </div>
  );
}
