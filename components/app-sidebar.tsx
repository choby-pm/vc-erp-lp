"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import LinkPending from "@/components/link-pending";
import LogoutButton from "@/components/logout-button";
import { ROLE_LABEL, type Role } from "@/lib/auth/roles";
import { SIDEBAR_FOLDED_COOKIE } from "@/lib/ui-prefs";

// 전체 메뉴 사이드바 (🔗 GP components/app-sidebar.tsx 와 같은 동작)
// · 넓은 화면: 왼쪽 고정. 접으면 아이콘만 (쿠키에 기억)
// · 좁은 화면: ☰ 버튼으로 여닫는다
// · 맨 위에 지금 일하는 기관 이름을 항상 보여준다 (여러 기관이 쓰는 서비스, L2)
// · "기관 관리" 메뉴는 관리자에게만 보인다. 메뉴는 릴리스가 진행되며 늘어난다

type Item = { href: string; label: string; icon: React.ReactNode; also?: string[] };

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden>
    <path d={d} />
  </svg>
);

const PANEL = "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M9 3v18";

const SECTIONS: { title: string; items: Item[]; adminOnly?: boolean }[] = [
  {
    title: "출자 업무",
    items: [
      { href: "/", label: "대시보드", icon: icon("M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z") },
      { href: "/approvals", label: "결재함", icon: icon("M9 12l2 2 4-4M12 3l7 4v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V7z") },
      { href: "/budgets", label: "출자 예산", icon: icon("M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6") },
      { href: "/programs", label: "출자사업", icon: icon("M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6") },
      { href: "/proposals", label: "출자 제안", icon: icon("M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11") },
      { href: "/commitments", label: "출자 건", icon: icon("M4 4h16v16H4zM8 9h8M8 13h8M8 17h5") },
      { href: "/capital-calls", label: "캐피탈콜", icon: icon("M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M6 10v4M18 10v4") },
      { href: "/cash-plan", label: "자금 계획", icon: icon("M3 3v18h18M7 15l4-4 3 3 5-6") },
      { href: "/notices", label: "통지함", icon: icon("M4 4h16v12H5.2L4 17.2zM8 9h8M8 12h5") },
      { href: "/funds", label: "조합", icon: icon("M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6") },
    ],
  },
  {
    title: "기준 정보",
    items: [{ href: "/gps", label: "운용사", icon: icon("M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M10 21v-4h4v4") }],
  },
  {
    title: "기관 관리",
    adminOnly: true,
    items: [
      { href: "/users", label: "사용자", icon: icon("M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.74") },
      { href: "/evaluation-criteria", label: "평가 항목", icon: icon("M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z") },
      { href: "/integration", label: "GP 연동", icon: icon("M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7") },
      { href: "/audit-logs", label: "감사 로그", icon: icon("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5") },
    ],
  },
];

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
  const sections = SECTIONS.filter((s) => !s.adminOnly || userRole === "admin");
  const pathname = usePathname();
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
            {section.items.map((item) => {
              const active = item.href === "/" ? pathname === "/" : [item.href, ...(item.also ?? [])].some((h) => pathname === h || pathname.startsWith(`${h}/`));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    title={compact ? item.label : undefined}
                    onClick={() => setOpen(false)}
                    className={`relative flex items-center rounded-lg py-2 text-sm font-medium ${compact ? "justify-center px-2" : "gap-3 px-3"} ${
                      active ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {item.icon}
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
