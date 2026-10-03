import Link from "next/link";
import ReportTable from "@/components/report-table";
import { getCurrentUser } from "@/lib/auth/session";
import { listReports } from "@/lib/services/reports";

export const metadata = { title: "GP 보고 · VC ERP LP" };

// GP 보고 목록 (R5-2). 연동 GP가 발행한 정기 보고는 자동으로 들어오고, 수기 조합은 조합 화면에서 입력한다
export default async function ReportsPage(props: PageProps<"/reports">) {
  const me = (await getCurrentUser())!;
  const { box } = await props.searchParams;
  const all = box === "all";
  const reports = await listReports(me.org_id, { unreviewed: !all });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">GP 보고</h1>
        <p className="mt-1 text-sm text-slate-500">
          GP가 보낸 정기 보고. 읽고 검토 완료를 표시합니다. 주목적 투자 비율로 약정 조건을 점검합니다 — 투자 기간 중 미달은 참고로만 봅니다 (L34).
        </p>
      </div>
      <div className="flex gap-2">
        {[
          ["unreviewed", "미검토"],
          ["all", "전체"],
        ].map(([b, label]) => (
          <Link
            key={b}
            href={`/reports?box=${b}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${(b === "all") === all ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      {reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">
          {all ? "받은 보고가 없습니다." : "검토할 보고가 없습니다."}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <ReportTable reports={reports} showFund />
        </div>
      )}
    </div>
  );
}
