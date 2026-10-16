import Link from "next/link";
import InvestmentObligations from "@/components/investment-obligations";
import { getCurrentUser } from "@/lib/auth/session";
import { getCommitment } from "@/lib/services/commitments";
import { getInvestmentObligations } from "@/lib/services/obligations";
import { performanceDate, AS_OF_ERROR } from "@/lib/performance-date";
import { loadOrNotFound } from "@/lib/page-helpers";
import { AppError } from "@/lib/api/errors";
export default async function ObligationPage(
  props: PageProps<"/commitments/[commitmentId]/obligations">,
) {
  const { commitmentId } = await props.params;
  const sp = await props.searchParams;
  const me = (await getCurrentUser())!;
  const c = await loadOrNotFound(() => getCommitment(me.org_id, commitmentId));
  const asOf = performanceDate(sp.as_of);
  if (!asOf) return <p role="alert">{AS_OF_ERROR}</p>;
  let data: Awaited<ReturnType<typeof getInvestmentObligations>> | null = null,
    message = "";
  try {
    data = await getInvestmentObligations(me.org_id, commitmentId, asOf);
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    message = e.message;
  }
  return (
    <div className="space-y-5">
      <Link
        href={`/commitments/${commitmentId}?as_of=${asOf}`}
        className="text-sm text-emerald-700"
      >
        ← 출자 건
      </Link>
      <h1 className="text-2xl font-bold">{c.fund_name} · 투자 의무</h1>
      <form className="flex items-center gap-2 text-sm">
        <label>
          기준일{" "}
          <input
            aria-label="의무 기준일"
            type="date"
            name="as_of"
            defaultValue={asOf}
            className="rounded border p-2"
          />
        </label>
        <button className="rounded border p-2">조회</button>
      </form>
      <p className="text-xs text-slate-500">
        현재 GP 판정의 기준일 집계입니다. 당시 발행한 보고는 보고 화면의 고정
        근거를 확인하세요. 실시간 조회 실패를 의무 없음으로 표시하지 않습니다.
      </p>
      {data ? (
        <>
          <p className="text-xs text-slate-500">
            GP 응답 수신: {data.received_at} · 조회 때 새로 받음
          </p>
          <InvestmentObligations snapshot={data.snapshot} />
        </>
      ) : (
        <p
          role="alert"
          className="rounded border border-amber-300 bg-amber-50 p-4"
        >
          GP 조회 실패: {message}
        </p>
      )}
    </div>
  );
}
