import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { listLocalRequests } from "@/lib/services/report-requests";
import ReportRequestsPanel from "@/components/report-requests-panel";
export default async function Page(
  props: PageProps<"/funds/[fundId]/report-requests">,
) {
  const { fundId } = await props.params,
    me = (await getCurrentUser())!;
  const data = await listLocalRequests(me.org_id, fundId);
  return (
    <div className="space-y-5">
      <Link className="text-sm text-emerald-700" href={`/funds/${fundId}`}>
        ← 조합
      </Link>
      <h1 className="text-2xl font-bold">분기 운용 보고 요청·회신</h1>
      <p className="text-sm text-slate-600">
        보고기간 종료일을 기준일로 요청합니다. 전송 성공은 접수이며 보고 수신
        완료와 다릅니다. 먼저{" "}
        <Link className="underline" href={`/funds/${fundId}/sharing`}>
          운용 보고 공유 허용
        </Link>
        이 필요합니다. 기한 경과는 표시만 하며 자동 취소하지 않습니다.
      </p>
      <ReportRequestsPanel
        fundId={fundId}
        data={JSON.parse(JSON.stringify(data))}
        canWrite={me.role === "admin" || me.role === "officer"}
      />
    </div>
  );
}
