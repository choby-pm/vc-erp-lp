import CriteriaEditor from "@/components/criteria-editor";
import NoPermission from "@/components/no-permission";
import { isAdmin } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { listCriteria, weightSum } from "@/lib/services/evaluations";

export const metadata = { title: "평가 항목 · VC ERP LP" };

// 심사 평가 항목 (관리자, BR-EVAL-01). 가중치를 바꿔도 이미 쓴 평가표는 평가 당시 값으로 계산된다
export default async function CriteriaPage() {
  const me = (await getCurrentUser())!;
  if (!isAdmin(me.role)) return <NoPermission area="평가 항목 관리" role={me.role} />;
  const criteria = await listCriteria(me.org_id, true);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">평가 항목</h1>
        <p className="mt-1 text-sm text-slate-500">심사위원이 출자 제안을 채점하는 항목과 가중치. 가중치를 바꿔도 이미 쓴 평가표는 평가 당시 값으로 남습니다.</p>
      </div>
      <CriteriaEditor criteria={criteria} weightSum={weightSum(criteria)} />
    </div>
  );
}
