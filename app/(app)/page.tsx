import { ROLE_LABEL } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = { title: "대시보드 · VC ERP LP" };

// 대시보드는 R7에서 만든다. 지금은 로그인한 기관·역할과 진행 상황만 보여준다
export default async function Home() {
  const user = (await getCurrentUser())!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">대시보드</h1>
        <p className="mt-1 text-sm text-slate-500">
          {user.org_name} · {user.name} ({ROLE_LABEL[user.role]})
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-slate-700">
          여러 GP의 조합에 한 출자를 계획 → 심사·선정 → 약정 → 납입 → 사후관리 → 회수·성과 분석까지 한곳에서 관리합니다.
        </p>
        <p className="mt-3 text-sm text-slate-400">업무 화면은 릴리스마다 왼쪽 메뉴에 추가됩니다. 예산·출자 현황·주의 목록은 R7 대시보드에서 보여줍니다.</p>
      </div>
    </div>
  );
}
