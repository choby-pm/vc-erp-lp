# 2026-10-16 QA 실패 메일 조사

읽기 전용 GitHub CLI 조회로 확인했다. 메일 본문 자체를 읽은 것은 아니다.

- [실패 실행 38795933393](https://github.com/choby-pm/vc-erp-lp/actions/runs/38795933393), 시작 2026-10-16 04:41:21 KST. 전날 실행은 성공.
- 첫 실패: GP `actions/checkout@v4`의 기본 브랜치 조회. `Not Found` 3회 후 실패.
- 조회 시 두 저장소 모두 `PRIVATE`. 워크플로는 GP가 공개라는 전제로 LP 기본 `GITHUB_TOKEN`으로 다른 저장소를 checkout한다. 기본 토큰으로 비공개 GP를 읽을 수 없는 것이 원인이다.
- 패키지 설치·환경 값 준비·LP/GP 테스트는 실행되지 않았다. W01 오류나 테스트 assertion 실패가 아니다.
- `if: always()`인 마지막 복원이 실행되며 `gp/.env.local` ENOENT가 추가 발생했다. 이는 checkout/환경 준비 실패의 후속 오류다.

추천 해결: GP 한 저장소의 Contents 읽기 권한만 가진 fine-grained PAT 또는 읽기 전용 deploy key를 LP Actions secret으로 등록하고 GP checkout에 연결. 공개 전환은 공개 범위 변경이므로 선택하지 않았다. 토큰을 코드·로그·문서에 넣지 않는다. 준비 단계 성공을 조건으로 마지막 복원 실행도 제한하면 후속 오류를 줄일 수 있다.

사용자 요청은 원인 설명이므로 원격 secret·공개 여부·워크플로 변경·재실행·배포 DB 복원을 수행하지 않았다.
