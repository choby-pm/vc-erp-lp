import NoPermission from "@/components/no-permission";
import { isAdmin } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { listUsers } from "@/lib/services/users";
import { UserCreateForm, UserRowActions } from "./user-actions";

export const metadata = { title: "사용자 · VC ERP LP" };

// 사용자 관리 (관리자, BR-AUTH-01·03·05). 우리 기관 사용자만 보인다 (BR-ORG-02)
export default async function UsersPage() {
  const me = (await getCurrentUser())!;
  if (!isAdmin(me.role)) return <NoPermission area="사용자 관리" role={me.role} />;

  const users = await listUsers(me.org_id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">사용자</h1>
        <p className="mt-1 text-sm text-slate-500">
          {me.org_name}에 로그인할 수 있는 사람과 역할. 다른 기관 사용자는 보이지 않습니다.
        </p>
      </div>

      <UserCreateForm />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">이메일 (로그인 ID)</th>
              <th className="px-4 py-3">역할</th>
              <th className="px-4 py-3">마지막 로그인</th>
              <th className="px-4 py-3 text-right">계정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className={u.disabled_at ? "text-slate-400" : ""}>
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {u.name}
                  {u.id === me.id && <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">나</span>}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{u.email}</td>
                <UserRowActions user={{ id: u.id, role: u.role, disabled: u.disabled_at !== null }} isSelf={u.id === me.id} lastLogin={formatDateTime(u.last_login_at)} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
