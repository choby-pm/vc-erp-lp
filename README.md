# VC ERP (LP)

출자기관(LP)이 **여러 GP의 여러 조합**에 한 출자를 계획 → 심사·선정 → 약정 → 납입 → 사후관리 → 회수·성과 분석 → 청산까지 관리하는 ERP MVP다.
같은 작업 폴더의 GP 시스템(`vc-erp/gp`)과 연동 API·서명 웹훅으로 양방향 연결된다.

똑똑 PM 지원용 개인 작업물이며, 실제 서비스와 무관한 연구 목적 프로젝트다. 기관·조합·금액은 모두 가상 데이터다.

> 2026-10-17 로컬 개발본에 과거 기준일 수정, 투자 의무 근거 조회, 기관별 공유와 철회, 분기 운용 보고 요청·회신, 선정 취소·캐피탈콜 취소 전파를 추가했다. 2026-10-17 배포 데모에도 반영했다. 실행 순서·검증·미완료 항목: [현재 검증·인수인계](docs/106_validation_handoff.md)

## 누가 무엇을 해결하나

| 대상 사용자 | 해결하는 문제 |
|---|---|
| 출자 담당 | 여러 GP 조합의 제안 심사·선정 조건·납입·분배 수령을 한 곳에서 처리한다. GP가 보낸 요청과 우리가 실제로 보낸 돈을 따로 기록한다 |
| 결재권자 | 선정·납입·총회 투표를 기안 시점 조건과 지금 기준 재점검을 함께 보고 승인한다. 본인 기안은 승인할 수 없다 |
| 기관 관리자 | 기관별 사용자·평가 항목·GP 연동 상태를 관리한다. 다른 기관 데이터는 보이지 않는다 |

## 5분 확인 순서

데모: <https://vc-erp-lp.vercel.app> (첫 화면 "데모로 둘러보기", 매일 03:00 KST 초기화) · 연결된 GP <https://vc-erp-gp.vercel.app> · 소개 페이지(로그인 없이): <https://vc-erp-lp.vercel.app/intro>

1. **선정 → GP 확약**: 출자 담당이 딥테크 제안의 선정 결재를 올린다 → 결재권자가 승인한다 → GP 출자 제안에 "LP 직접" 확약과 앵커 조건(최소 결성액)이 생긴다.
2. **요청·승인·송금·대사 구분**: 캐피탈콜 납입 기안 → 승인(송금 대기) → 송금 기록 → 출자 건 대사가 "불일치(GP 확인 전)"로 남는다 → GP가 입금을 기록하면 "일치"가 되고 이력이 남는다.
3. **차단 확인**: 요청액보다 큰 납입 기안, 본인 기안 승인, 다른 기관 출자 건 주소 직접 접근이 모두 막히고 이유가 보인다.

상세 순서는 [제출용 요약](docs/00_summary.md)과 [시연 대본](docs/97_demo_script.md)에 있다.

## 핵심 설계 결정

| 결정 | 이유 | 기록 |
|---|---|---|
| 우리 장부와 GP 원장 사본을 따로 두고 대사한다 | 송금했어도 GP가 아직 확인하지 않은 상태가 정상적으로 존재한다. 한쪽 기록으로 다른 쪽을 덮어쓰지 않는다 | [L6](docs/99_decisions.md), [L31](docs/99_decisions.md) |
| 선정·납입·투표는 내부 결재를 거친다 | 승인은 송금이 아니다. 기안 시점 조건을 보존하고 승인 직전에 다시 점검한다 | [L4](docs/99_decisions.md) |
| 연동은 이벤트 신호 + API 재조회, 상대 기록 변경은 상대 담당자 확인 | 순서 뒤바뀜·중복에도 결과가 같다. 선정 취소·콜 취소도 통보 후 상대가 확인한다 | [BR-SYNC-05](docs/04_business_rules.md), [L63·L64](docs/99_decisions.md) |

## 요구사항 → 규칙 → 구현 → 검증

| 요구 | 업무 규칙 | 구현 | 검증 |
|---|---|---|---|
| 같은 기준일이면 상세와 전체 성과가 같아야 한다 | 기준일 입력 검증 (L58) | `lib/performance-date.ts`, 성과 화면 | 날짜·DB 경계·정정 롤백 검증, Chrome ([W01](docs/qa-reports/2026-10-16-w01.md)) |
| 보고 요청은 전송 성공이 아니라 수신 확인으로 완료 | 전송 상태와 업무 상태 분리 (L62) | `lib/services/report-requests.ts` | API 20건 + 경계 2건, 양쪽 실제 화면 ([W05](docs/103_report_requests.md)) |
| 선정을 취소하면 GP 모집 현황도 바뀌어야 한다 | 확약 철회 통보 → GP 확인 (L63) | `lib/gp/responses.ts`, `lib/services/commitments.ts` | GP 롤백 11건, 실제 화면 선정→취소→GP 확인 |

## 역할과 AI 활용

VC 관리·운영 업무 경험이 있는 지인에게 VC 업무와 조합 조성 참여자의 역할·필요 기능을 인터뷰했다. 똑똑 사용자 가이드도 참고했다. 이를 바탕으로 AI(Claude Code·Codex)를 활용해 기획하고 구현했다. 결정이 필요한 사항은 AI가 질문하도록 했고, 사용자가 선택한 결정은 [결정 기록](docs/99_decisions.md)에 "사용자 결정"으로 남겼다. 인터뷰는 초기 도메인·이해관계자 조사다. 워터폴·세금·결재선 등 금융·실무 규칙의 현업 검증으로 쓰지 않는다 ([실무 확인 목록](docs/98_practice_check.md), [규약 검증 대장](docs/100_policy-validation.md)).

## 검증 범위

- 기능마다 lint·타입 검사·프로덕션 빌드, 핵심 규칙은 롤백 검증 스크립트나 API 시나리오, 대표 흐름은 실제 Chrome(Playwright) 화면으로 확인했다. API QA를 브라우저 QA로 세지 않는다.
- `npm run qa:e2e`는 배포 데모에 HTTP 요청을 보내는 업무 시나리오 QA다(GitHub Actions 매일 실행). 2026-10-17 배포 후 [Actions QA](https://github.com/choby-pm/vc-erp-lp/actions/runs/38941361259)에서 LP 45/45·GP 41/41가 통과했다. 배포 브라우저 재확인은 남아 있다.
- 단순화·미확인: 평가액 롤포워드(L40 ⚠️), 워터폴·세금·회계 규칙은 실무 근거 수신 전 가정이다. 화면과 문서에 ⚠️로 표시한다.

## 실행 방법

```bash
cp docs/env.example .env.local  # 자리표시자 교체, GP와 API 키·서명 비밀값 일치
npm install
npm run db:migrate   # DB 테이블 만들기 (db/migrations)
npm run db:seed      # 데모 기관 2곳 × 역할 3개 계정 → demo-accounts.md
npm run gp:link -- --org a --gp-lp-id <GP 출자자 ID>   # 기관 a·b 각각. GP 쪽 npm run db:seed-lp-demo 출력의 출자자 ID
npm run db:seed-scenario   # 전 단계 데모 시나리오 (있으면 건너뜀)
npm run dev          # http://localhost:3200 (GP는 3000, GP 마이그레이션·서버 먼저)
npm run check:numbers      # 숫자 일치 점검 (-- --demo 는 배포 데모 DB)
```

`.env.local` 에 `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, GP 연동 값(`GP_DEMO_BASE_URL`은 `/api/lp/v1`까지)이 필요하다. 비밀값은 Git에 넣지 않는다.

문서: [기획 문서 목록](docs/README.md) · [투자 의무](docs/101_investment_obligations.md) · [공유](docs/102_lp_sharing.md) · [요청/회신](docs/103_report_requests.md) · [화면 문구](docs/105_workflow_ux.md)
