"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ApiError = { error?: { message?: string } };

const DEMO_ROLES = [
  { role: "officer", label: "출자 담당", hint: "제안 심사·결재 기안·납입 기록" },
  { role: "approver", label: "결재권자", hint: "선정·납입·투표 결재" },
  { role: "admin", label: "관리자", hint: "모든 기능 + 사용자·연동 관리" },
] as const;

export default function LoginForm({ orgs }: { orgs: { key: string; name: string }[] }) {
  const router = useRouter();
  const [org, setOrg] = useState(orgs[0]?.key ?? "a");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function submit(kind: string, url: string, body: unknown) {
    setPending(kind);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as ApiError;
        setError(data.error?.message ?? "로그인에 실패했습니다");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <p className="text-sm font-medium text-slate-700">데모로 둘러보기</p>
        <div role="tablist" aria-label="데모 기관" className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          {orgs.map((o) => (
            <button
              key={o.key}
              type="button"
              role="tab"
              aria-selected={org === o.key}
              onClick={() => setOrg(o.key)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                org === o.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {o.name}
            </button>
          ))}
        </div>
        <div className="grid gap-2">
          {DEMO_ROLES.map((r) => (
            <button
              key={r.role}
              type="button"
              disabled={pending !== null}
              onClick={() => submit(`demo-${r.role}`, "/api/v1/auth/demo-login", { org, role: r.role })}
              className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left hover:bg-emerald-100 disabled:opacity-60"
            >
              <span>
                <span className="block text-sm font-semibold text-emerald-900">{r.label}로 들어가기</span>
                <span className="block text-xs text-emerald-700">{r.hint}</span>
              </span>
              <span className="text-sm text-emerald-700">{pending === `demo-${r.role}` ? "…" : "→"}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">두 기관의 데이터는 서로 보이지 않습니다. 결재는 담당으로 올리고 결재권자로 승인해 보세요.</p>
      </section>

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        또는
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit("login", "/api/v1/auth/login", { email, password });
        }}
      >
        <label className="block">
          <span className="text-sm font-medium text-slate-700">이메일</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">비밀번호</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </label>
        <button
          type="submit"
          disabled={pending !== null}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {pending === "login" ? "확인 중…" : "로그인"}
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
