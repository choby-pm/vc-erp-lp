"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import LinkPending from "@/components/link-pending";
import LogoutButton from "@/components/logout-button";
import { ROLE_LABEL, type Role } from "@/lib/auth/roles";
import { NAV, groupOf } from "@/lib/nav";
import { SIDEBAR_FOLDED_COOKIE } from "@/lib/ui-prefs";

// 전체 메뉴 사이드바 (🔗 GP components/app-sidebar.tsx 와 같은 동작)
// · 넓은 화면: 왼쪽 고정. 접으면 아이콘만 (쿠키에 기억)
// · 좁은 화면: ☰ 버튼으로 여닫는다
// · 맨 위에 지금 일하는 기관 이름을 항상 보여준다 (여러 기관이 쓰는 서비스, L2)
// · 메뉴 표는 lib/nav.ts (묶음 = 한 줄, 묶음 안의 화면은 위쪽 탭). "관리" 는 관리자에게만 보인다

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden>
    <path d={d} />
  </svg>
);

const PANEL = "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M9 3v18";

export default function AppSidebar({
  orgName,
  userName,
  userRole,
  initialFolded,
  pendingApprovals = 0,
}: {
  orgName: string;
  userName: string;
  userRole: Role;
  initialFolded: boolean;
  pendingApprovals?: number; // 내가 결재할 대기 건수 (결재권자·관리자)
}) {
  const sections = NAV.filter((s) => !s.adminOnly || userRole === "admin");
  const pathname = usePathname();
  const current = groupOf(pathname);
  const [open, setOpen] = useState(false);
  const [folded, setFolded] = useState(initialFolded);

  function toggleFold() {
    const next = !folded;
    setFolded(next);
    document.cookie = `${SIDEBAR_FOLDED_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  const renderNav = (compact: boolean) => (
    <nav className={`flex flex-1 flex-col overflow-y-auto py-4 ${compact ? "gap-3 px-2" : "gap-6 px-3"}`}>
      {sections.map((section, i) => (
        <div key={section.title}>
          {compact ? (
            i > 0 && <div className="mx-2 mb-3 border-t border-slate-200" />
          ) : (
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{section.title}</p>
          )}
          <ul className={`space-y-0.5 ${compact ? "" : "mt-2"}`}>
            {section.groups.map((group) => {
              const active = current?.key === group.key;
              const item = { href: group.tabs[0].href, label: group.label };
              return (
                <li key={group.key}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    title={compact ? item.label : undefined}
                    onClick={() => setOpen(false)}
                    className={`relative flex items-center rounded-lg py-2 text-sm font-medium ${compact ? "justify-center px-2" : "gap-3 px-3"} ${
                      active ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {icon(group.icon)}
                    <span className={compact ? "sr-only" : ""}>{item.label}</span>
                    {item.href === "/approvals" && pendingApprovals > 0 && (
                      <span aria-label={`결재 대기 ${pendingApprovals}건`} className={`rounded-full bg-amber-500 text-[11px] font-bold leading-none text-white ${compact ? "absolute ml-5 -mt-5 px-1.5 py-0.5" : "ml-auto px-2 py-1"}`}>
                        {pendingApprovals}
                      </span>
                    )}
                    {!compact && <LinkPending />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const renderFooter = (compact: boolean) =>
    compact ? (
      <div className="flex flex-col items-center gap-2 border-t border-slate-200 py-3">
        <span title={`${userName} · ${ROLE_LABEL[userRole]}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
          {userName.slice(0, 1)}
        </span>
        <LogoutButton compact />
      </div>
    ) : (
      <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-sm">
        <span className="truncate text-slate-700">
          {userName} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{ROLE_LABEL[userRole]}</span>
        </span>
        <LogoutButton />
      </div>
    );

  const logo = (
    <Link href="/" className="min-w-0">
      <span className="block text-[11px] font-bold tracking-wide text-emerald-600">VC ERP · LP</span>
      <span className="block truncate text-sm font-bold text-slate-900">{orgName}</span>
    </Link>
  );

  return (
    <>
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 md:flex ${folded ? "w-16" : "w-60"}`}
      >
        <div className={`flex h-14 items-center border-b border-slate-200 ${folded ? "justify-center" : "justify-between gap-2 pl-5 pr-3"}`}>
          {!folded && logo}
          <button
            type="button"
            onClick={toggleFold}
            aria-label={folded ? "메뉴 펼치기" : "메뉴 접기"}
            aria-expanded={!folded}
            title={folded ? "메뉴 펼치기" : "메뉴 접기"}
            className="shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            {folded ? icon(`${PANEL} M14 9l3 3-3 3`) : icon(`${PANEL} M17 15l-3-3 3-3`)}
          </button>
        </div>
        {renderNav(folded)}
        {renderFooter(folded)}
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 md:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="메뉴 열기" className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100">
          {icon("M4 6h16M4 12h16M4 18h16")}
        </button>
        {logo}
      </header>
      {open && (
        <div className="fixed inset-0 z-30 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between gap-2 border-b border-slate-200 px-5">
              {logo}
              <button type="button" onClick={() => setOpen(false)} aria-label="메뉴 닫기" className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
                {icon("M6 6l12 12M18 6L6 18")}
              </button>
            </div>
            {renderNav(false)}
            {renderFooter(false)}
          </aside>
        </div>
      )}
    </>
  );
}
