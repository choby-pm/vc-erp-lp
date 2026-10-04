// 메뉴 구조 (사이드바 + 묶음 안의 탭). 사이드바와 탭이 같은 표를 본다
// · 묶음 = 사이드바 한 줄. 묶음 안의 화면은 위쪽 탭으로 오간다 (🔗 GP 조합 상세의 큰 탭·작은 탭과 같은 생각)
// · 순서: 출자 담당이 자주 여는 순 — 오늘 할 일(대시보드·결재) → 기한이 있는 돈(납입·분배) → GP가 보낸 것(통지·보고·총회)
//         → 시기가 정해진 일(심사·선정) → 가끔 보는 분석(성과) → 기준 정보 → 관리자 설정
// · 주소는 바꾸지 않는다 (대시보드·주의 목록·알림 링크가 그대로 맞도록). 탭은 각 화면의 목록 주소로 간다

export type NavTab = { href: string; label: string };
export type NavGroup = { key: string; label: string; icon: string; tabs: NavTab[]; also?: string[] };
export type NavSection = { title: string; groups: NavGroup[]; adminOnly?: boolean };

export const NAV: NavSection[] = [
  {
    title: "오늘 할 일",
    groups: [
      { key: "dashboard", label: "대시보드", icon: "M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z", tabs: [{ href: "/", label: "대시보드" }] },
      { key: "approvals", label: "결재함", icon: "M9 12l2 2 4-4M12 3l7 4v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V7z", tabs: [{ href: "/approvals", label: "결재함" }] },
    ],
  },
  {
    title: "출자 업무",
    groups: [
      {
        key: "money",
        label: "납입·분배",
        icon: "M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M6 10v4M18 10v4",
        tabs: [
          { href: "/capital-calls", label: "캐피탈콜" },
          { href: "/distributions", label: "분배" },
          { href: "/cash-plan", label: "자금 계획" },
        ],
        also: ["/payments"],
      },
      {
        key: "monitoring",
        label: "사후관리",
        icon: "M4 4h16v12H5.2L4 17.2zM8 9h8M8 12h5",
        tabs: [
          { href: "/notices", label: "통지함" },
          { href: "/reports", label: "GP 보고" },
          { href: "/meetings", label: "총회" },
        ],
      },
      {
        key: "selection",
        label: "출자 심사",
        icon: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
        tabs: [
          { href: "/proposals", label: "출자 제안" },
          { href: "/programs", label: "출자사업" },
          { href: "/board", label: "공고 게시판" },
          { href: "/budgets", label: "출자 예산" },
        ],
      },
      {
        key: "portfolio",
        label: "포트폴리오",
        icon: "M4 20V10M10 20V4M16 20v-7M22 20H2",
        tabs: [
          { href: "/commitments", label: "출자 건" },
          { href: "/performance", label: "성과" },
        ],
      },
    ],
  },
  {
    title: "기준 정보",
    groups: [
      {
        key: "master",
        label: "조합·운용사",
        icon: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6",
        tabs: [
          { href: "/funds", label: "조합" },
          { href: "/gps", label: "운용사" },
        ],
      },
    ],
  },
  {
    title: "관리",
    adminOnly: true,
    groups: [
      {
        key: "settings",
        label: "기관 설정",
        icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
        tabs: [
          { href: "/users", label: "사용자" },
          { href: "/integration", label: "GP 연동" },
          { href: "/evaluation-criteria", label: "평가 항목" },
          { href: "/audit-logs", label: "감사 로그" },
        ],
      },
    ],
  },
];

const under = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

// 지금 화면이 속한 묶음 (상세·수정 화면 포함)
export function groupOf(pathname: string): NavGroup | null {
  for (const s of NAV) for (const g of s.groups) if ([...g.tabs.map((t) => t.href), ...(g.also ?? [])].some((h) => under(pathname, h))) return g;
  return null;
}
