import { redirect } from "next/navigation";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import LogoutButton from "./logout-button";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-semibold tracking-widest text-emerald-600">VC ERP · LP</span>
          <span className="text-sm font-semibold text-slate-900">{user.org_name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">
            {user.name} · <span className="text-slate-500">{ROLE_LABEL[user.role]}</span>
          </span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-16">
        <h1 className="text-3xl font-bold text-slate-900">출자기관 ERP</h1>
        <p className="text-slate-600">
          여러 GP의 조합에 한 출자를 계획 → 심사·선정 → 약정 → 납입 → 사후관리 → 회수·성과 분석까지 한곳에서 관리합니다.
        </p>
        <p className="text-sm text-slate-400">R0 개발 환경 완료. 업무 화면은 R1부터 추가됩니다.</p>
      </main>
    </div>
  );
}
