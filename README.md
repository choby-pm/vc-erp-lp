# VC ERP (LP)

출자기관(LP)이 **여러 GP의 여러 조합**에 한 출자를 계획 → 심사·선정 → 약정 → 납입 → 사후관리 → 회수·성과 분석까지 관리하는 ERP MVP.
같은 작업 폴더의 GP 시스템(`vc-erp/gp`)과 연동 API·웹훅으로 연결된다.

똑똑 PM 지원용 개인 작업물이며, 실제 서비스와 무관한 연구 목적 프로젝트다.

- 기획 문서: [docs/README.md](docs/README.md)
## 실행 방법

```bash
npm install
npm run db:migrate   # DB 테이블 만들기 (db/migrations)
npm run db:seed      # 데모 기관 2곳 × 역할 3개 계정 → demo-accounts.md
npm run dev          # http://localhost:3200 (GP는 3100)
```

`.env.local` 에 `DATABASE_URL`, `DATABASE_URL_UNPOOLED` 가 필요하다 (`vercel env pull`).
