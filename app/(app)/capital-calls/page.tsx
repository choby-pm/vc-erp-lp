import Link from "next/link";
import CapitalCallTable from "@/components/capital-call-table";
import { getCurrentUser } from "@/lib/auth/session";
import { formatKRW } from "@/lib/format";
import { listCapitalCalls } from "@/lib/services/capital-calls";

export const metadata = { title: "캐피탈콜 · VC ERP LP" };

const TABS = [
  ["unpaid", "미납"],
  ["overdue", "기한 경과"],
  ["all", "전체"],
] as const;

// 캐피탈콜 목록 (R4-1). 모든 출자 건에 온 납입 요청. 연동 GP는 자동으로 들어오고 수기 조합은 출자 건 화면에서 입력한다
export default async function CapitalCallsPage(props: PageProps<"/capital-calls">) {
  const me = (await getCurrentUser())!;
  const { status: raw } = await props.searchParams;
  const status = TABS.find(([s]) => s === raw)?.[0] ?? "unpaid";
  const calls = await listCapitalCalls(me.org_id, { status });
  const due = calls.filter((c) => !c.cancelled_at).reduce((s, c) => s + c.call_amount - c.paid_amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">캐피탈콜</h1>
        <p className="mt-1 text-sm text-slate-500">
          GP가 보낸 납입 요청. 연동 GP는 자동으로 들어오고, 수기 조합은 출자 건 화면에서 입력합니다. 납입은 결재를 거쳐 송금 기록합니다 (R4-2).
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map(([s, label]) => (
            <Link
              key={s}
              href={`/capital-calls?status=${s}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${status === s ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {label}
            </Link>
          ))}
        </div>
        {status !== "all" && calls.length > 0 && <p className="text-sm text-slate-600">아직 낼 금액 합계 {formatKRW(due)}</p>}
      </div>

      {calls.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">
          {status === "all" ? "받은 캐피탈콜이 없습니다." : status === "overdue" ? "기한이 지난 미납 캐피탈콜이 없습니다." : "미납 캐피탈콜이 없습니다."}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <CapitalCallTable calls={calls} showFund canCancel={false} />
        </div>
      )}
    </div>
  );
}
