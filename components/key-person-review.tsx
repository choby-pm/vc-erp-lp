"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// 핵심 운용 인력 변경 확인 (R5-4, L37)
export default function KeyPersonReview({ fundId }: { fundId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const res = await fetch(`/api/v1/funds/${fundId}/key-person-review`, { method: "POST" });
          const body = await res.json().catch(() => ({}));
          setPending(false);
          if (!res.ok) return setError(body.error?.message ?? "확인하지 못했습니다");
          router.refresh();
        }}
        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
      >
        변경 확인함
      </button>
      {error && <span className="text-xs text-rose-700">{error}</span>}
    </span>
  );
}
