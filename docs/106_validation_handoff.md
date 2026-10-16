# 현재 검증·인수인계 (2026-10-17)

## 현재 범위

W01 기준일, W03 투자 의무, W04 자료 공유, W05 요청·회신, GP W06 독립 실행 승인, W07 업무 문구를 로컬 구현·기능별 커밋했다. **이번 변경은 push·배포하지 않았다.** W02 실제 규약·예시는 미수신이며 금융 가정은 검증 완료로 표시하지 않는다.

모델·사용자 결정·검증: [정책 대장](100_policy-validation.md), [투자 의무](101_investment_obligations.md), [공유](102_lp_sharing.md), [요청/회신](103_report_requests.md), [화면 문구](105_workflow_ux.md), [GP 실행 승인](https://github.com/choby-pm/vc-erp-gp/blob/main/docs/104_investment_approvals.md).

## 실행과 증거

각 저장소의 `docs/env.example`을 `.env.local`로 복사하고 개발 DB·GP API 키·서명 비밀값을 설정한다. GP 마이그레이션·서버를 먼저 적용한 뒤 LP를 적용한다. GP 3000, LP 3200이며 GP_DEMO_BASE_URL은 `/api/lp/v1`까지 포함한다. `npm run gp:link -- --help`로 기관↔GP 출자자 연결을 설정하고 GP 웹훅 URL의 연결 ID를 교체한다. 비밀값을 Git에 넣지 않는다.

검증 명령은 각 저장소 폴더에서 실행한다.

```bash
# LP: 읽기·롤백 중심
node --env-file=.env.local scripts/check-performance-dates.mjs --db
npm run check:numbers
# 아래 QA는 로컬 서버에 명시적인 가상 요청·정정 보고·감사 기록을 남긴다.
node --env-file=.env.local scripts/qa-obligations.mjs
node --env-file=.env.local scripts/qa-sharing.mjs
node --env-file=.env.local scripts/qa-report-requests.mjs
node scripts/check-report-request-boundaries.mjs
# GP: 전체 롤백 검증
node --env-file=.env.local scripts/check-investment-approvals.mjs
```

| 범위 | 결과 |
|---|---|
| W01 | 날짜13·DB27·정정 롤백9, Chrome 상세/전체/잘못된 날짜 |
| W03 | 도메인27·API7, GP 취소/재인정→LP 실제 조회 |
| W04 | 도메인11·API16, 철회→기존 보고 보존→요청/승인→재공유 실제 화면 |
| W05 | API20+경계2, 정정 버전·원본 보존·장애 주입/복구, 실제 요청/접수/회신/양쪽 완료 |
| W06 | GP 롤백15, 신규/후속·자기 승인·자금/상태·이전 승인 보존, 실제 변경 조건 재승인/집행 |
| 숫자 | 개발 DB 85개 일치 |
| 코드 | 기능별 lint·타입·build, 최종 W07 양쪽 프로덕션 빌드 통과 |

API 결과와 화면 증거는 [QA 폴더](qa-reports)에 있다. 현재 LP 대기 결재가 없어 W07 시점 신규 결재 확인창은 코드·타입 검증만 했고 GP 분배 설명은 브라우저에서 확인했다. W08에서 가상 납입 1,000원 결재로 확인창 표시를 실제 화면 확인했다([캡처](qa-reports/evidence/2026-10-17/w08-approval-context.jpg)). 이 가상 결재는 로컬 DB에 남아 있다. 이후 통합 브라우저 재현 내용은 진행 기록에 추가한다.

## 실패 메일과 CI

[2026-10-16 조사](qa-reports/2026-10-16-ci-investigation.md): 비공개 GP checkout 404로 테스트 시작 전 실패했다. 기본 LP GITHUB_TOKEN은 형제 private GP 저장소를 읽지 못했다. `GP_REPO_READ_TOKEN`(GP 저장소 contents:read)을 사용할 수 있게 하고 환경 파일 생성 전 실패 시 마지막 복원을 건너뛰도록 수정했다. 실제 token/secret 등록·원격 워크플로 재실행은 하지 않았다.

GP 전체 QA의 투자 시나리오는 별도 관리자 실행 승인을 거치도록 수정했다. 대상 QA 사이트의 `QA_GP_APPROVER_EMAIL/PASSWORD`가 GP_QA_ENV에 필요하며 로컬에서는 비공개 시드 계정 파일을 사용할 수 있다. 새 QA는 문법 검사만 했고 배포 대상 전체 QA는 미실행이다.

## 남은 항목과 사례

실제 규약 검증, 첨부 다운로드 성공, 배포 cron 재시도, 새 배포본에서 선정→확약부터 전체 브라우저 완주는 남아 있다. 재로그인 맥락 복원은 검토만 했다. 기관 변경 시 이전 기관 주소를 자동 복원하지 않는다.

기획 사례: 화면 기준일과 계산 기준일을 같은 검증 함수로 묶고 잘못된 날짜 정책을 사용자에게 결정받았다. 공유 철회 시 과거 결재 근거 보존과 최신 GP 접근 차단을 분리했다.

FDE 사례: 수신한 보고를 저장한 뒤 GP에 수신 확인을 보내며, 접속 장애는 같은 요청 키 재전송, 회신 불가는 사유가 있는 업무 상태로 처리한다. 배포 실패 메일도 계산 문제와 체크아웃 권한 문제를 구분해 진단했다.

W03~W06 가상 QA 데이터와 감사 기록은 로컬에 남아 있다. 과거 확정 보고를 수정·삭제하지 않았다. 원격 push와 배포는 별도 실행 범위다.
