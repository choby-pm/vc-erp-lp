import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session-cookie";

// 빠른 1차 확인: 세션 쿠키가 아예 없으면 DB를 조회하기 전에 로그인 화면으로 보낸다.
// 쿠키가 진짜 유효한지는 각 화면과 API가 DB에서 다시 확인한다 (getCurrentUser)
export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // 로그인 화면, API, 정적 파일은 제외
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
