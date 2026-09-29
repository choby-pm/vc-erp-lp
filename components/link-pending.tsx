"use client";

import { useLinkStatus } from "next/link";

// 링크를 누른 뒤 다음 화면이 오기 전까지 링크 옆에 작은 표시 (같은 화면 안의 탭 이동처럼 loading.tsx 가 안 뜨는 경우)
export default function LinkPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`ml-1.5 inline-block h-3 w-3 shrink-0 rounded-full border-2 border-emerald-300 border-t-emerald-600 align-middle transition-opacity ${pending ? "animate-spin opacity-100" : "opacity-0"}`}
    />
  );
}
