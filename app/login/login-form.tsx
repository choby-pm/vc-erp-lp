"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ApiError = { error?: { message?: string } };

const DEMO_ROLES = [
  { role: "officer", label: "출자 담당", hint: "제안 심사·결재 기안·납입 기록" },
  { role: "approver", label: "결재권자", hint: "선정·납입·투표 결재" },
  { role: "admin", label: "관리자", hint: "모든 기능 + 사용자·연동 관리" },
] as const;

export default function LoginForm({ orgs }: { orgs: readonly { key: string; label: string; hint: string }[] }) {
  const router = useRouter();
  const [demoRole, setDemoRole] = useState("officer");
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
        <label className="flex items-center justify-between gap-3 text-sm text-slate-600">
          체험 역할
          <select aria-label="체험 역할" value={demoRole} onChange={e => setDemoRole(e.target.value)} disabled={pending !== null} className="rounded-lg border border-slate-300 bg-white px-3 py-2">
            {DEMO_ROLES.map(r => <option key={r.role} value={r.role}>{r.label}</option>)}
          </select>
        </label>
        <div className="grid gap-2" aria-label="데모 체험">
          {orgs.map((o) => (
            <button
              key={o.key}
              type="button"
              disabled={pending !== null}
              onClick={() => submit(`demo-${o.key}`, "/api/v1/auth/demo-login", { org: o.key, role: demoRole })}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left hover:bg-emerald-100 disabled:opacity-60"
            >
              <span className="block text-sm font-semibold text-emerald-900">{o.label} {pending === `demo-${o.key}` ? "…" : "→"}</span>
              <span className="block text-xs text-emerald-700">{o.hint}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">케이스별 데이터는 분리되어 있습니다. 결재는 출자 담당으로 올린 뒤 결재권자로 전환해 승인하세요.</p>
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
