import { redirect } from "next/navigation";
import FundForm from "@/components/fund-form";
import { getCurrentUser } from "@/lib/auth/session";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getFund } from "@/lib/services/funds";

export const metadata = { title: "조합 수정 · VC ERP LP" };

export default async function EditFundPage(props: PageProps<"/funds/[fundId]/edit">) {
  const { fundId } = await props.params;
  const me = (await getCurrentUser())!;
  const fund = await loadOrNotFound(() => getFund(me.org_id, fundId));
  if (fund.data_source === "gp_api") redirect(`/funds/${fund.id}`); // 연동 조합은 GP 값이라 고칠 수 없다 (BR-COM-05)
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">조합 수정</h1>
      <FundForm fund={fund} />
    </div>
  );
}
