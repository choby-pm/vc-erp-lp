"use client";

import { useState } from "react";

// 임시 비밀번호는 서버가 한 번만 알려준다. 이 화면을 벗어나면 다시 볼 수 없다 (BR-STF-03)
export default function TempPasswordNotice({
  loginEmail,
  tempPassword,
  onDone,
}: {
  loginEmail: string;
  tempPassword: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
      <p className="font-semibold text-amber-900">로그인 계정 정보 — 지금 한 번만 보입니다</p>
      <p className="mt-1 text-sm text-amber-800">이 화면을 벗어나면 비밀번호를 다시 볼 수 없습니다. 본인에게 안전하게 전달하세요.</p>
      <dl className="mt-4 grid gap-2 rounded-lg bg-white p-4 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-slate-500">로그인 ID</dt>
        <dd className="font-mono font-semibold text-slate-900">{loginEmail}</dd>
        <dt className="text-slate-500">임시 비밀번호</dt>
        <dd className="font-mono text-lg font-semibold tracking-wider text-slate-900">{tempPassword}</dd>
      </dl>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(`로그인 ID: ${loginEmail}\n임시 비밀번호: ${tempPassword}`).catch(() => null);
            setCopied(true);
          }}
          className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
        >
          {copied ? "복사됨" : "복사"}
        </button>
        <button type="button" onClick={onDone} className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700">
          전달했습니다
        </button>
      </div>
    </div>
  );
}
