import Link from "next/link";
import SharingPanel from "@/components/sharing-panel";
import { getCurrentUser } from "@/lib/auth/session";
import { fetchFundSharing, storedFundSharing } from "@/lib/services/sharing";
import { sql } from "@/lib/db";
import { notFound } from "next/navigation";
export default async function SharingPage(
  props: PageProps<"/funds/[fundId]/sharing">,
) {
  const { fundId } = await props.params,
    me = (await getCurrentUser())!;
  const [fund] = await sql<
    { name: string }[]
  >`select name from funds where org_id=${me.org_id} and id=${fundId}`;
  if (!fund) notFound();
  let state:
      | Awaited<ReturnType<typeof fetchFundSharing>>
      | Awaited<ReturnType<typeof storedFundSharing>> = null,
    error = "";
  try {
    state = await fetchFundSharing(me.org_id, fundId);
  } catch (e) {
    error = e instanceof Error ? e.message : "상태 확인 실패";
    state = await storedFundSharing(me.org_id, fundId);
  }
  return (
    <div className="space-y-5">
      <Link href={`/funds/${fundId}`} className="text-sm text-emerald-700">
        ← 조합
      </Link>
      <h1 className="text-2xl font-bold">{fund.name} · GP 자료 공유</h1>
      <p className="text-sm text-slate-600">
        본인 납입·분배·기본 조합 정보는 계속 조회합니다. 선택 자료의 개별
        제목·존재는 미허용 상태에서 조회하지 않습니다. 기존 수신 보고와 결재
        근거는 읽기 전용으로 보존하며 이미 내려받은 파일은 회수되지 않습니다.
      </p>
      {error && (
        <p role="alert" className="rounded bg-amber-50 p-3">
          현재 GP 상태 확인 실패: {error}. 아래는 마지막 확인 상태이며 새
          승인으로 간주하지 않습니다.
        </p>
      )}
      {state && (
        <>
          <p className="text-xs text-slate-500">
            {state.fresh ? "현재 확인" : "최근 캐시"}: {state.checked_at}
          </p>
          <SharingPanel
            fundId={fundId}
            snapshot={state.snapshot}
            canRequest={
              state.fresh && (me.role === "admin" || me.role === "officer")
            }
          />
        </>
      )}
    </div>
  );
}
