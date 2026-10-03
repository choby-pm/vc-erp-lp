import Link from "next/link";
import { AckButton, NewNoticeForm } from "@/components/notice-actions";
import { getCurrentUser } from "@/lib/auth/session";
import { sql } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { NOTICE_TYPE_LABEL } from "@/lib/labels";
import { listNotices } from "@/lib/services/notices";
import { NOTICE_TYPES } from "@/lib/schemas/notices";

export const metadata = { title: "통지함 · VC ERP LP" };

// 통지함 (R5-1). GP가 보낸 모든 통지(출자 제안·캐피탈콜·보고·총회·분배·일반)와 수기로 기록한 통지
// 확인하면 연동 GP에도 "확인함"이 전달된다 (BR-NTC-02)
export default async function NoticesPage(props: PageProps<"/notices">) {
  const me = (await getCurrentUser())!;
  const sp = await props.searchParams;
  const all = sp.box === "all";
  const type = NOTICE_TYPES.find((t) => t === sp.type);
  const notices = await listNotices(me.org_id, { unacknowledged: !all, type });
  const manualFunds = await sql<{ id: string; name: string }[]>`select id, name from funds where org_id = ${me.org_id} and data_source = 'manual' order by name`;
  const canWrite = me.role === "admin" || me.role === "officer";
  const href = (box: string, t?: string) => `/notices?box=${box}${t ? `&type=${t}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">통지함</h1>
          <p className="mt-1 text-sm text-slate-500">GP에게서 받은 통지. 확인하면 연동 GP에도 &ldquo;확인함&rdquo;이 전달됩니다.</p>
        </div>
        {canWrite && <NewNoticeForm funds={manualFunds} />}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ["unacked", "미확인"],
          ["all", "전체"],
        ].map(([box, label]) => (
          <Link
            key={box}
            href={href(box, type)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${(box === "all") === all ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {label}
          </Link>
        ))}
        <span className="mx-1 text-slate-300">|</span>
        <Link href={href(all ? "all" : "unacked")} className={`rounded-full border px-3 py-1 text-xs font-medium ${!type ? "border-slate-400 bg-slate-100 text-slate-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          모든 종류
        </Link>
        {NOTICE_TYPES.map((t) => (
          <Link
            key={t}
            href={href(all ? "all" : "unacked", t)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${type === t ? "border-slate-400 bg-slate-100 text-slate-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {NOTICE_TYPE_LABEL[t]}
          </Link>
        ))}
      </div>

      {notices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">
          {all ? "받은 통지가 없습니다." : "확인할 통지가 없습니다."}
        </div>
      ) : (
        <ul className="space-y-3">
          {notices.map((n) => (
            <li key={n.id} className={`rounded-2xl border bg-white p-5 ${n.acknowledged_at ? "border-slate-200" : "border-emerald-200"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{NOTICE_TYPE_LABEL[n.notice_type]}</span>
                    {n.data_source === "gp_api" ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">GP 연동</span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">수기</span>
                    )}
                    <h2 className="font-semibold text-slate-900">{n.title}</h2>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {n.fund_id ? (
                      <Link href={`/funds/${n.fund_id}`} className="hover:text-emerald-700">
                        {n.gp_name} · {n.fund_name}
                      </Link>
                    ) : (
                      "조합 없음"
                    )}{" "}
                    · {formatDateTime(n.sent_at)}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  {n.acknowledged_at ? (
                    <>
                      확인 {n.acknowledged_by_name} · {formatDateTime(n.acknowledged_at)}
                      {n.data_source === "gp_api" && (
                        <span className={`block ${n.gp_ack_sent_at ? "text-slate-400" : "text-amber-700"}`}>{n.gp_ack_sent_at ? "GP에 전달함" : "GP에 아직 못 보냄"}</span>
                      )}
                    </>
                  ) : (
                    canWrite && <AckButton noticeId={n.id} />
                  )}
                </div>
              </div>
              {n.body && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-emerald-700">내용 보기</summary>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">{n.body}</p>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
