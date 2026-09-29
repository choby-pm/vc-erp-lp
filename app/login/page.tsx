import { redirect } from "next/navigation";
import { DEMO_ORGS } from "@/lib/auth/demo";
import { getCurrentUser } from "@/lib/auth/session";
import LoginForm from "./login-form";

export const metadata = { title: "로그인 · VC ERP LP" };

export default async function LoginPage() {
  // 이미 로그인한 상태면 홈으로 보낸다
  if (await getCurrentUser()) redirect("/");

  const orgs = Object.entries(DEMO_ORGS).map(([key, o]) => ({ key, name: o.name }));

  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold tracking-widest text-emerald-600">VC ERP · LP</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">출자기관 ERP</h1>
          <p className="mt-2 text-sm text-slate-500">출자 계획부터 회수·성과 분석까지</p>
        </div>
        <LoginForm orgs={orgs} />
      </div>
    </main>
  );
}
