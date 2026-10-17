# 현재 검증·인수인계 (2026-10-17)

## 현재 범위

W01 기준일, W03 투자 의무, W04 자료 공유, W05 요청·회신과 선정·콜 취소 전파(L63·L64), GP W06 독립 실행 승인, W07 업무 문구를 로컬 구현·기능별 커밋했다. W02 실제 규약·예시는 미수신이며 금융 가정은 검증 완료로 표시하지 않는다.

모델·사용자 결정·검증: [정책 대장](100_policy-validation.md), [투자 의무](101_investment_obligations.md), [공유](102_lp_sharing.md), [요청/회신](103_report_requests.md), [화면 문구](105_workflow_ux.md), [GP 실행 승인](https://github.com/choby-pm/vc-erp-gp/blob/main/docs/104_investment_approvals.md).

## 실행과 증거

각 저장소의 `docs/env.example`을 `.env.local`로 복사하고 개발 DB·GP API 키·서명 비밀값을 설정한다. GP 마이그레이션·서버를 먼저 적용한 뒤 LP를 적용한다. GP 3000, LP 3200이며 GP_DEMO_BASE_URL은 `/api/lp/v1`까지 포함한다. `npm run gp:link -- --org a|b --gp-lp-id <GP 출자자 ID>`로 기관↔GP 출자자 연결을 설정하고 GP 웹훅 URL의 연결 ID를 교체한다. 비밀값을 Git에 넣지 않는다.

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
| W05 취소 전파 | 선정 취소→GP 철회 통보·확인, GP 콜 취소→LP 확인 차단·승인 차단·반려·확인 실제 화면. GP 롤백 11+8건 |
| W08 통합 | [실제 화면](qa-reports/2026-10-17-w08.md): 선정→확약, 납입 기안→승인→송금→GP 입금→대사, 기준일 상세=전체 |
| 숫자 | 개발 DB 84개 일치 (2026-10-17 W08 후, 취소 전파·납입 데이터 반영) |
| 코드 | 기능별 lint·타입·build, 최종 W07 양쪽 프로덕션 빌드 통과 |

API 결과와 화면 증거는 [QA 폴더](qa-reports)에 있다. 현재 LP 대기 결재가 없어 W07 시점 신규 결재 확인창은 코드·타입 검증만 했고 GP 분배 설명은 브라우저에서 확인했다. W08에서 가상 납입 1,000원 결재로 확인창 표시를 실제 화면 확인했다([캡처](qa-reports/evidence/2026-10-17/w08-approval-context.jpg)). 이 가상 결재는 로컬 DB에 남아 있다. 이후 통합 브라우저 재현 내용은 진행 기록에 추가한다.

## 실패 메일과 CI

[2026-10-16 조사](qa-reports/2026-10-16-ci-investigation.md): 비공개 GP checkout 404로 테스트 시작 전 실패했다. 기본 LP GITHUB_TOKEN은 형제 private GP 저장소를 읽지 못했다. GP 저장소 읽기 전용 배포 키(`GP_REPO_DEPLOY_KEY`)로 checkout하게 하고 환경 파일 생성 전 실패 시 마지막 복원을 건너뛰도록 수정했다. 이후 승인된 배포 과정에서 배포 키와 QA 승인자 secret을 등록했고 아래 Actions 실행이 성공했다.

GP 전체 QA의 투자 시나리오는 별도 관리자 실행 승인을 거치도록 수정했다. 대상 QA 사이트의 `QA_GP_APPROVER_EMAIL/PASSWORD`를 별도 Actions secret으로 넘기며 로컬에서는 비공개 시드 계정 파일을 사용할 수 있다. 배포 후 전체 API QA는 아래 Actions 실행에서 LP 45/45·GP 41/41 통과했다. 브라우저 QA와 구분한다.

## 배포 (2026-10-17 02:20~02:45 KST)

데모 DB에 스키마만 반영(GP 020~026 → LP 012~015, `db:demo-migrate`, D55/L65) → GP main push(Vercel 자동 배포) → LP `vercel deploy --prod`. 배포 후 GitHub Actions QA 수동 실행 [통과](https://github.com/choby-pm/vc-erp-lp/actions/runs/38941361259): LP·연동 45/45, GP 41/41, 시작·끝 데모 복원 성공. 배포 키 checkout과 QA 승인자 비밀값도 이 실행에서 확인됐다. 비밀값 노출 점검: 두 저장소 전체 이력에서 `.env.local` 값·계정 비밀번호·키 형식 0건. 배포본의 화면 직접 조작(브라우저) 재확인은 하지 않았다.

## 남은 항목과 사례

실제 규약 검증, 첨부 다운로드 성공, 배포 cron 재시도, 신규 의무 포함 보고의 발행→수신 전체, 배포본의 브라우저 재확인은 남아 있다. 전체 API QA는 위 배포 후 실행으로 통과했으며 UI 검증을 대신하지 않는다. 로컬 브라우저 통합 확인은 [W08 보고](qa-reports/2026-10-17-w08.md)에 있다. 재로그인 맥락 복원은 검토만 했다. 기관 변경 시 이전 기관 주소를 자동 복원하지 않는다.

기획 사례: 화면 기준일과 계산 기준일을 같은 검증 함수로 묶고 잘못된 날짜 정책을 사용자에게 결정받았다. 공유 철회 시 과거 결재 근거 보존과 최신 GP 접근 차단을 분리했다.

FDE 사례: 수신한 보고를 저장한 뒤 GP에 수신 확인을 보내며, 접속 장애는 같은 요청 키 재전송, 회신 불가는 사유가 있는 업무 상태로 처리한다. 배포 실패 메일도 계산 문제와 체크아웃 권한 문제를 구분해 진단했다.

W03~W06 가상 QA 데이터와 감사 기록은 로컬에 남아 있다. 과거 확정 보고를 수정·삭제하지 않았다.
