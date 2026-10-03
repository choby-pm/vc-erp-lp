"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LinkPending from "@/components/link-pending";
import { groupOf } from "@/lib/nav";

// 묶음 안의 탭 (lib/nav.ts). 화면이 2개 이상인 묶음의 목록 화면 위에만 보인다
// 상세·수정 화면(예: /capital-calls/123)에서는 숨겨서 화면 제목과 뒤로 가기에 집중하게 한다
export default function SectionTabs() {
  const pathname = usePathname();
  const group = groupOf(pathname);
  if (!group || group.tabs.length < 2 || !group.tabs.some((t) => t.href === pathname)) return null;
  return (
    <nav aria-label={group.label} className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
      {group.tabs.map((t) => {
        const active = t.href === pathname;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium ${
              active ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            {t.label}
            <LinkPending />
          </Link>
        );
      })}
    </nav>
  );
}
