"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import TempPasswordNotice from "@/components/temp-password-notice";
import { ROLE_LABEL, ROLES, type Role } from "@/lib/auth/roles";

type ApiError = { error?: { message?: string; details?: { fields?: Record<string, string> } } };

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as ApiError).error;
    const field = err?.details?.fields ? Object.values(err.details.fields)[0] : null;
    throw new Error(field ?? err?.message ?? "요청이 실패했습니다");
  }
  return (data as { data: unknown }).data;
}

const ROLE_HINT: Record<Role, string> = {
  admin: "모든 작업 + 사용자·연동 관리",
  officer: "제안 심사·결재 기안·납입 기록",
  approver: "선정·납입·투표 결재",
  viewer: "조회만",
};

// 사용자 추가: 임시 비밀번호는 서버가 한 번만 알려준다
export function UserCreateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("officer");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  if (created) {
    return (
      <TempPasswordNotice
        loginEmail={created.email}
        tempPassword={created.password}
        onDone={() => {
          setCreated(null);
          router.refresh();
        }}
      />
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
        + 사용자 추가
      </button>
    );
  }

  return (
    <form
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          const data = (await send("/api/v1/users", "POST", { email, name, role })) as { user: { email: string }; temp_password: string };
          setCreated({ email: data.user.email, password: data.temp_password });
          setOpen(false);
          setEmail("");
          setName("");
          setRole("officer");
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setPending(false);
        }
      }}
    >
      <p className="font-semibold text-slate-900">사용자 추가</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">이름</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-slate-700">이메일 (로그인 ID)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">역할</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          {ROLES.map((r) => (
            <label key={r} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${role === r ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"}`}>
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
              <span className="block font-semibold text-slate-900">{ROLE_LABEL[r]}</span>
              <span className="block text-xs text-slate-500">{ROLE_HINT[r]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
          {pending ? "추가하는 중…" : "추가하고 임시 비밀번호 받기"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          취소
        </button>
      </div>
    </form>
  );
}

// 표의 한 줄: 역할 바꾸기 · 계정 중지/다시 사용. 자기 자신은 바꿀 수 없다 (BR-AUTH-03·05)
export function UserRowActions({ user, isSelf, lastLogin }: { user: { id: string; role: Role; disabled: boolean }; isSelf: boolean; lastLogin: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(url: string, method: string, body?: unknown) {
    setPending(true);
    setError(null);
    try {
      await send(url, method, body);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <td className="px-4 py-3">
        {isSelf ? (
          <span className="text-slate-700">{ROLE_LABEL[user.role]}</span>
        ) : (
          <select
            aria-label="역할"
            value={user.role}
            disabled={pending || user.disabled}
            onChange={(e) => run(`/api/v1/users/${user.id}/role`, "PUT", { role: e.target.value })}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm disabled:opacity-60"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        )}
        {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">{lastLogin}</td>
      <td className="px-4 py-3 text-right">
        {user.disabled ? (
          <span className="inline-flex items-center gap-2">
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">중지됨</span>
            <button type="button" disabled={pending} onClick={() => run(`/api/v1/users/${user.id}/enable`, "POST")} className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-60">
              다시 사용
            </button>
          </span>
        ) : isSelf ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">사용 중</span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">사용 중</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm("이 계정을 중지할까요? 지금 로그인해 있어도 바로 끊깁니다.")) run(`/api/v1/users/${user.id}/disable`, "POST");
              }}
              className="text-xs font-medium text-rose-700 hover:underline disabled:opacity-60"
            >
              중지
            </button>
          </span>
        )}
      </td>
    </>
  );
}
