# VC ERP (LP)

출자기관(LP)이 **여러 GP의 여러 조합**에 한 출자를 계획 → 심사·선정 → 약정 → 납입 → 사후관리 → 회수·성과 분석까지 관리하는 ERP MVP.
같은 작업 폴더의 GP 시스템(`vc-erp/gp`)과 연동 API·웹훅으로 연결된다.

똑똑 PM 지원용 개인 작업물이며, 실제 서비스와 무관한 연구 목적 프로젝트다.

2026-10-17 로컬 개발본: 과거 기준일 수정, 투자 의무 근거 조회, 공유 철회 전 보고 보존, 분기 운용 보고 요청·회신을 추가했다. **아래 배포 데모에는 이번 변경을 아직 배포하지 않았다.** [현재 검증·인수인계](docs/106_validation_handoff.md)에서 실행 순서·검증·미완료 항목을 확인할 수 있다.

- **제출용 요약 · 둘러보기 순서: [docs/00_summary.md](docs/00_summary.md)** · 소개 페이지(캡처, 로그인 없이 공개): <https://vc-erp-lp.vercel.app/intro> (원본 `public/intro/index.html`) · 시연 대본: [docs/97_demo_script.md](docs/97_demo_script.md)
- 배포(데모): <https://vc-erp-lp.vercel.app> · 연결된 GP <https://vc-erp-gp.vercel.app> — 첫 화면 "데모로 둘러보기", 매일 03:00 KST 초기화
- 기획 문서: [docs/README.md](docs/README.md)
## 실행 방법

```bash
cp docs/env.example .env.local  # 자리표시자 교체, GP와 API 키·서명 비밀값 일치
npm install
npm run db:migrate   # DB 테이블 만들기 (db/migrations)
npm run db:seed      # 데모 기관 2곳 × 역할 3개 계정 → demo-accounts.md
npm run gp:link      # GP 연동 설정 (GP 쪽 npm run db:seed-lp-demo 먼저)
npm run db:seed-scenario   # 전 단계 데모 시나리오 (있으면 건너뜀)
npm run dev          # http://localhost:3200 (GP는 3000)
npm run check:numbers      # 숫자 일치 점검 (-- --demo 는 배포 데모 DB)
```

`.env.local` 에 `DATABASE_URL`, `DATABASE_URL_UNPOOLED` 가 필요하다 (`vercel env pull`).

기관별 공유와 새 보고 요청은 GP 마이그레이션·서버를 먼저 적용해야 한다. 상세 모델: [투자 의무](docs/101_investment_obligations.md), [공유](docs/102_lp_sharing.md), [요청/회신](docs/103_report_requests.md). 금융 산식은 [실제 규약 검증 대장](docs/100_policy-validation.md)의 근거 수신 전 기존 가정으로 유지한다.
