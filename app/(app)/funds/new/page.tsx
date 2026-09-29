import Link from "next/link";
import FundForm from "@/components/fund-form";
import { getCurrentUser } from "@/lib/auth/session";
import { listGps } from "@/lib/services/gps";

export const metadata = { title: "조합 등록 · VC ERP LP" };

// 수기 조합 등록 (L18). 연동 GP는 조합이 자동으로 들어오므로 고를 수 없다 (BR-FUND-01)
export default async function NewFundPage(props: PageProps<"/funds/new">) {
  const me = (await getCurrentUser())!;
  const { gp_id } = await props.searchParams;
  const gps = (await listGps(me.org_id)).filter((g) => !g.is_linked).map((g) => ({ id: g.id, name: g.name }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">조합 등록</h1>
      {gps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">
          조합을 등록하려면 운용사가 먼저 있어야 합니다.{" "}
          <Link href="/gps/new" className="font-semibold text-emerald-700 underline">
            운용사 등록
          </Link>
        </div>
      ) : (
        <FundForm gps={gps} defaultGpId={typeof gp_id === "string" && gps.some((g) => g.id === gp_id) ? gp_id : undefined} />
      )}
    </div>
  );
}
