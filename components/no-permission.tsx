import { ROLE_LABEL, type Role } from "@/lib/auth/roles";
import { withJosa } from "@/lib/format";

// 관리자 전용 화면에 다른 역할로 들어왔을 때 (D42). 서버 API도 같은 규칙으로 막는다
export default function NoPermission({ area, role }: { area: string; role: Role | undefined }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <p className="text-base font-semibold text-slate-900">{withJosa(area, "은는")} 관리자만 볼 수 있습니다</p>
      <p className="mt-1 text-sm text-slate-500">내 권한: {role ? ROLE_LABEL[role] : "-"} · 필요하면 관리자에게 권한 변경을 요청하세요.</p>
    </div>
  );
}
