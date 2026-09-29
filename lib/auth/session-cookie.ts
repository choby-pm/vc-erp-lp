// 세션 쿠키 이름. proxy.ts 에서도 쓰므로 DB 코드와 분리해 둔다.
// 브라우저 쿠키는 포트를 구분하지 않아 localhost:3100(GP)과 3200(LP)이 쿠키를 함께 쓴다.
// 이름을 GP(gp_session)와 다르게 해서 두 시스템의 로그인이 서로 덮어쓰지 않게 한다
export const SESSION_COOKIE = "lp_session";
