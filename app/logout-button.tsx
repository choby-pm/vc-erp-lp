"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => null);
        router.replace("/login");
        router.refresh();
      }}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      {pending ? "나가는 중…" : "로그아웃"}
    </button>
  );
}
