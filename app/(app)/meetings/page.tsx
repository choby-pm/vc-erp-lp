import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { MEETING_TYPE_LABEL } from "@/lib/labels";
import { listMeetings } from "@/lib/services/meetings";

export const metadata = { title: "총회 · VC ERP LP" };

const STATUS_LABEL: Record<string, string> = { scheduled: "소집", held: "개최 완료", cancelled: "취소" };

// 총회 목록 (R5-3). 투표할 수 있는 총회가 위로. 투표는 결재를 거쳐 GP에 직접 제출된다
export default async function MeetingsPage(props: PageProps<"/meetings">) {
  const me = (await getCurrentUser())!;
  const { box } = await props.searchParams;
  const all = box === "all";
  const meetings = await listMeetings(me.org_id, { votable: !all });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">총회</h1>
        <p className="mt-1 text-sm text-slate-500">GP가 소집한 조합원 총회. 안건마다 찬반과 검토 의견을 정해 투표 결재를 받으면, 연동 GP에는 바로 제출됩니다.</p>
      </div>
      <div className="flex gap-2">
        {[
          ["votable", "투표할 총회"],
          ["all", "전체"],
        ].map(([b, label]) => (
          <Link
            key={b}
            href={`/meetings?box=${b}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${(b === "all") === all ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      {meetings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">{all ? "받은 총회가 없습니다." : "지금 투표할 총회가 없습니다."}</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="whitespace-nowrap border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">총회</th>
                <th className="px-4 py-3">조합</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">우리 투표</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {meetings.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3">
                    <Link href={`/meetings/${m.id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                      {MEETING_TYPE_LABEL[m.meeting_type] ?? m.meeting_type} · {formatDate(m.meeting_date)}
                    </Link>
                    <span className="block text-xs text-slate-400">
                      안건 {m.agenda_count}건 · {m.data_source === "gp_api" ? "GP 연동" : "수기"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {m.fund_name}
                    <span className="block text-xs text-slate-400">{m.gp_name}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {STATUS_LABEL[m.status]}
                    {m.can_vote && <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">투표 가능</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {m.vote_submit_error_code === "GP_REJECTED" ? (
                      <span className="font-semibold text-rose-600">제출 실패</span>
                    ) : m.agenda_count > 0 && m.submitted_count === m.agenda_count ? (
                      <span className="font-semibold text-emerald-700">제출 완료</span>
                    ) : m.pending_approval ? (
                      <span className="text-violet-700">결재 대기</span>
                    ) : (
                      `찬반 ${m.voted_count}/${m.agenda_count}`
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
