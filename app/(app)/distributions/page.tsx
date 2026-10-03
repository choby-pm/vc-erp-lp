import Link from "next/link";
import DistributionTable from "@/components/distribution-table";
import { getCurrentUser } from "@/lib/auth/session";
import { formatKRW } from "@/lib/format";
import { listDistributions } from "@/lib/services/distributions";

export const metadata = { title: "분배 · VC ERP LP" };

// 분배 목록 (R6-1). GP가 확정한 분배가 "수령 대기"로 들어오고, 통장 입금을 보고 수령을 기록한다 (L39)
export default async function DistributionsPage(props: PageProps<"/distributions">) {
  const me = (await getCurrentUser())!;
  const { status: raw } = await props.searchParams;
  const status = raw === "received" || raw === "all" ? raw : "announced";
  const rows = await listDistributions(me.org_id, { status });
  const canWrite = me.role === "admin" || me.role === "officer";
  const waiting = rows.filter((d) => d.status === "announced").reduce((s, d) => s + d.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">분배</h1>
        <p className="mt-1 text-sm text-slate-500">
          GP가 돌려주는 돈. GP가 분배를 확정하면 수령 대기로 들어오고, 통장 입금을 확인한 뒤 수령을 기록하면 우리 장부에 남고 GP 원장과 대사합니다.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {[
            ["announced", "수령 대기"],
            ["received", "수령"],
            ["all", "전체"],
          ].map(([s, label]) => (
            <Link
              key={s}
              href={`/distributions?status=${s}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${status === s ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {label}
            </Link>
          ))}
        </div>
        {status === "announced" && rows.length > 0 && <p className="text-sm text-slate-600">수령 대기 합계 {formatKRW(waiting)}</p>}
      </div>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">
          {status === "announced" ? "수령 대기 중인 분배가 없습니다." : "분배가 없습니다."}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <DistributionTable rows={rows} showFund canWrite={canWrite} />
        </div>
      )}
    </div>
  );
}
