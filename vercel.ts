import type { VercelConfig } from "@vercel/config/v1";

// Vercel 프로젝트 설정 (R3-7, L21·L23, 🔗 GP vercel.ts 와 같은 방식)
// · regions: 서버를 DB(Neon, 싱가포르)와 같은 곳에 둔다. 기본값(미국 동부)이면 쿼리마다 태평양을 왕복해 화면이 느리다 (🔗 GP D44)
// · crons: 무료(Hobby) 요금제는 하루 1회까지
//   - sync: 놓친 GP 이벤트 가져오기 + 처리·재시도 + 못 보낸 응답 보내기. 매일 00:30 UTC (= 09:30 KST, GP 이벤트 전송 00:00 UTC 다음)
//   - reset-demo: 데모 DB를 매일 03:00 KST(18:00 UTC)에 되돌린다. GP와 같은 시각 (L23)
export const config: VercelConfig = {
  framework: "nextjs",
  regions: ["sin1"],
  crons: [
    { path: "/api/cron/sync", schedule: "30 0 * * *" },
    { path: "/api/cron/reset-demo", schedule: "0 18 * * *" },
  ],
};
