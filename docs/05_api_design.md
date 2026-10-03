# 05. API 설계 (확정)

> 기준 문서: [03 DB 설계](03_db_design.md), [04 비즈니스 규칙](04_business_rules.md), [99 결정 기록](99_decisions.md)
>
> API는 **화면(또는 다른 시스템)이 서버에 일을 시키는 창구**다.
> 이 문서는 LP ERP의 창구 목록, 주고받는 데이터 형식, 그리고 **GP 시스템과 주고받는 창구**를 정한다.

---

## 1. API의 네 종류

```
┌────────────┐ ① LP ERP 내부 API ┌──────────────┐ ③ GP 호출 (LP 연동 API) ┌──────────────┐
│ LP ERP 화면 │ ────────────────→ │              │ ──────────────────────→ │              │
│ (Next.js)  │   /api/v1/...     │ LP ERP 서버  │  /api/lp/v1/...         │  GP 서버     │
└────────────┘                   │ + LP DB      │                         │  + GP DB     │
                                 │              │ ←────────────────────── │              │
┌────────────┐ ④ 주기 작업        │              │ ② 웹훅 받기              │              │
│ Vercel Cron│ ────────────────→ │              │  /api/webhooks/gp/...   │              │
└────────────┘                   └──────────────┘                         └──────────────┘
```

| 종류 | 누가 호출 | 무엇을 | 인증 |
|---|---|---|---|
| ① 내부 API | LP ERP 화면 | 기관 업무 전체 | 로그인 세션 → **기관 + 역할** (BR-ORG-01, BR-AUTH-02) |
| ② 웹훅 받기 | GP 서버 | "바뀌었다" 알림 | HMAC 서명 (BR-SYNC-01) |
| ③ GP 호출 | LP ERP 서버 → GP | 데이터 다시 읽기, 제안 응답·통지 확인·투표 보내기 | GP가 준 API 키 (환경 변수) |
| ④ 주기 작업 | Vercel Cron | 이벤트 처리, 놓친 이벤트 가져오기, 못 보낸 것 다시 보내기 | `CRON_SECRET` |

GP 05 API 설계에서 ②·③은 GP가 **보내는 쪽·받는 쪽**으로 이미 정의돼 있다. 이 문서는 그 반대편이다.

---

## 2. 공통 규칙

GP 05 2장과 **같다** (L13): 주소 `/api/v1`, snake_case, 금액 원 단위 정수, 날짜 `YYYY-MM-DD`, 응답 `{ data }` / `{ data, meta }` / `{ error: { code, message, rule, details } }`, 400/401/403/404/409/422/500 구분, 상태 변경은 동작 API(`POST …/approve`), 돈이 움직이는 요청은 `Idempotency-Key`, 금액 검사는 미리보기 API.

LP ERP에 더하는 것:

| 항목 | 규칙 |
|---|---|
| 기관 | 주소에 기관 ID를 넣지 않는다. **세션의 기관**이 곧 범위다 (BR-ORG-01). `/api/v1/orgs/{org_id}/…` 같은 주소는 만들지 않는다 |
| 다른 기관 ID | 어떤 API든 다른 기관 데이터 ID면 `404 NOT_FOUND` (BR-ORG-03) |
| GP 관리 필드 | 연동 행의 GP 값을 바꾸는 요청은 `409 GP_MANAGED_FIELD` (BR-COM-05) |
| GP 호출 실패 | GP로 보내는 게 실패해도 LP ERP 저장은 성공으로 답하고, 응답에 `gp_sync: { status: "pending" }` 을 넣는다 (BR-SYNC-10). GP가 업무 규칙으로 거부하면 `{ status: "rejected", message }`, 보낼 것이 없으면 `{ status: "not_needed" }` (L24) |

> **기관 ID를 주소에 넣지 않는 이유**: 주소에 있으면 사용자가 숫자만 바꿔 다른 기관을 시도할 수 있고,
> 서버는 "주소의 기관 = 세션의 기관" 검사를 **모든 API에서** 빠짐없이 해야 한다. 아예 받지 않으면 빠뜨릴 검사도 없다.

---

## 3. LP ERP 내부 API 목록

> 표기: 💰 멱등성 키 필수 · 👁 미리보기(저장 안 함) · 🔄 상태를 바꾸는 동작 · ✍ 결재 기안이 함께 올라감
> 주소의 `/api/v1` 은 생략. 권한: 관 = 관리자, 담 = 출자 담당, 결 = 결재권자, 모두 = 조회 포함 전원

### 3-1. 인증
| 메서드 | 주소 | 설명 | 권한 |
|---|---|---|---|
| POST | `/auth/login` | 이메일·비밀번호 로그인 | |
| POST | `/auth/demo-login` | 데모 로그인 `{ "org": "a" \| "b", "role": "officer" \| "approver" \| "admin" }` — 기관 2곳 × 역할을 골라 들어간다 | |
| POST | `/auth/logout` | | |
| GET | `/auth/me` | 사용자 + **기관** + 역할 | 모두 |

### 3-2. 기관 · 사용자 · 감사 로그
| 메서드 | 주소 | 설명 | 권한 |
|---|---|---|---|
| GET · PATCH | `/org` | 우리 기관 정보 | 모두 · 관 |
| GET · POST | `/users` | 사용자 목록 · 추가 (임시 비밀번호 1회 표시) | 관 |
| PATCH | `/users/{user_id}` | 이름 등 | 관 |
| PUT | `/users/{user_id}/role` | 역할 변경 (자기 자신 불가, BR-AUTH-03) | 관 |
| POST 🔄 | `/users/{user_id}/disable` · `/enable` | | 관 |
| GET | `/audit-logs?user_id=&from=&to=&result=` | 감사 로그 (우리 기관만) | 관 |

### 3-3. 운용사 · 조합
| 메서드 | 주소 | 설명 | 권한 |
|---|---|---|---|
| GET · POST | `/gps` | 운용사 목록(연동 여부 표시) · 등록 | 모두 · 담 |
| GET · PATCH | `/gps/{gp_id}` | 상세(조합·출자 이력) · 수정 | 모두 · 담 |
| GET | `/funds?status=&strategy=&data_source=&gp_id=` | 조합 목록 | 모두 |
| POST | `/funds` | 수기 조합 등록 (L18, 연동 GP는 불가) | 담 |
| GET | `/funds/{fund_id}` | 조합 + 제안 + 출자 건 요약 + 동기화 시각 | 모두 |
| PATCH | `/funds/{fund_id}` | 수기 조합 정보 수정. 연동 조합은 `{ strategy }` 만 (나머지는 GP 값, L24) | 담 |
| POST 🔄 | `/funds/{fund_id}/status` | 수기 조합 상태 변경 `{ "status": "formed", "formation_date": "…", "fund_size_amount": … }` (BR-FUND-02) | 담 |
| POST 🔄 | `/funds/{fund_id}/resync` | GP와 다시 맞추기 (BR-SYNC-09) | 담 |

### 3-4. 출자 계획 · 출자사업
| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET · POST | `/budgets` | 연도별 예산 목록(사용 현황 포함) · 생성 | BR-BUD-01 |
| GET · PATCH | `/budgets/{budget_id}` | 상세 · 총액 수정 | BR-BUD-06 |
| PUT | `/budgets/{budget_id}/allocations` | 분야별 배분 통째로 저장 | BR-BUD-02 |
| GET · POST | `/programs` | 출자사업 목록 · 작성 | |
| GET · PATCH · DELETE | `/programs/{program_id}` | 상세(부문별 접수·선정 현황, 예산 잔액) · 수정 · 삭제 (수정·삭제는 작성 중에만) | BR-PRG-02 |
| POST · PATCH · DELETE | `/programs/{program_id}/tracks[/{track_id}]` | 모집 부문 (`draft` 에서만) | BR-PRG-02 |
| POST 🔄 | `/programs/{program_id}/open` · `/start-review` · `/close` | 공고 · 심사 시작 · 선정 완료 | BR-PRG-01, 03 |

### 3-5. 출자 제안 · 심사
| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/proposals?status=&program_id=&channel=&data_source=` | 제안 목록 (칸반용 단계별) | |
| POST | `/proposals` | 수기 제안 등록 — 운용사(기존 ID 또는 새로 입력) + 조합 계획 + 요청액 | BR-PROP-01~02, BR-PRG-04 |
| GET · PATCH | `/proposals/{proposal_id}` | 상세(평가·선정 조건·결재·단계 이력·GP 응답 상태) · 수정 — 수기: 요청액·접수일·메모, 연동: `{ program_track_id, memo }` (L24) | |
| POST 🔄 | `/proposals/{proposal_id}/stage` | 단계 이동 `{ "to_status": "presentation", "note": "…" }`. 응답에 `gp_sync` (연동 제안) | BR-PROP-04, 06 |
| POST 🔄 | `/proposals/{proposal_id}/reject` · `/withdraw` | 탈락 · 철회 | BR-PROP-04, 05 |
| POST 🔄 | `/proposals/{proposal_id}/gp-response/resend` | GP에 응답 다시 보내기 (GP가 거부했던 것도). 응답 `{ status: sent | pending | rejected }` | BR-SYNC-11 |
| GET · POST · PATCH | `/evaluation-criteria[/{criterion_id}]` | 평가 항목 (관리자) | BR-EVAL-01 |
| POST 🔄 | `/evaluation-criteria/{criterion_id}/retire` | 항목 은퇴 | BR-EVAL-01 |
| GET | `/proposals/{proposal_id}/evaluations` | 평가표 전체 + 단계별 평균 | BR-EVAL-05 |
| PUT | `/proposals/{proposal_id}/evaluations/{stage}` | **내** 평가표 저장 `{ "scores": [{ "criterion_id", "score" }], "opinion" }` | BR-EVAL-02~04 |

### 3-6. 선정 · 결재
| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| PUT | `/proposals/{proposal_id}/selection-terms` | 선정 조건 저장 | BR-SEL-01, BR-APR-03 |
| GET 👁 | `/proposals/{proposal_id}/selection-check` | 예산·부문 한도·평가 여부 점검 결과 (4-1) | BR-SEL-02 |
| POST ✍ | `/proposals/{proposal_id}/selection-approvals` | 선정 결재 기안 `{ "request_comment" }` | BR-SEL-02, BR-APR-01~04 |
| GET | `/approvals?box=to_me\|mine\|all&status=pending` | 결재함 | |
| GET | `/approvals/{approval_id}` | 결재 상세 (스냅샷 + 지금 값과 차이) | BR-APR-04 |
| POST 🔄💰 | `/approvals/{approval_id}/approve` | 승인 `{ "decision_comment" }` → 대상별 후속 처리 (4-1, 4-2) | BR-APR-05~07, BR-SEL-03 |
| POST 🔄 | `/approvals/{approval_id}/reject` | 반려 `{ "decision_comment" }` (필수) | BR-APR-06 |

> 결재 승인·반려는 **결재권자·관리자**, 기안은 **출자 담당·관리자** (BR-AUTH-01, L12).

### 3-7. 출자 건 · 약정
| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/commitments?status=&gp_id=&vintage_year=&strategy=` | 출자 포트폴리오 (약정·납입·분배·NAV·배수·대사 상태) | 6장 뷰 |
| GET | `/commitments/{commitment_id}` | 상세 | |
| GET 👁 | `/commitments/{commitment_id}/formation-check?commitment_amount=&fund_size_amount=&formation_date=` | 결성 확인 조건표. 수기는 입력 중인 값으로 미리 보기. 항목별 `ok`: 통과 / 미달 / `null`(해당 없음) | BR-CMT-02 |
| POST 🔄💰 | `/commitments/{commitment_id}/confirm` | 결성 확인. 수기는 `{ "commitment_amount", "fund_size_amount", "formation_date" }`(결성 전 조합이면 조합도 결성 완료, L25), 연동은 본문 없음(GP와 다시 맞춘 뒤 GP 값). 미달이면 `422 FORMATION_CHECK_FAILED` + `details.checks` | BR-CMT-02~04 |
| POST 🔄 | `/commitments/{commitment_id}/cancel` | 선정 취소 `{ "reason" }` | BR-CMT-05 |
| POST 💰 | `/commitments/{commitment_id}/commitment-adjustments` | 약정 변경 (취소 행 + 새 행) `{ "new_amount", "entry_date", "memo" }`. 활성만(`COMMITMENT_NOT_ACTIVE`), 사유 필수, 연동이면 약정 대사 | BR-CMT-06 |
| GET | `/commitments/{commitment_id}/ledger` | 우리 장부와 GP 원장 사본을 **나란히** (구분별 합계 + 지금 대사 상태, 7일 안 불일치는 `waiting`). 수기는 `gp: null` | BR-REC-04, 07 |
| GET 👁 | `/commitments/{commitment_id}/close-check` | 청산 확인 조건표 | BR-CLOSE-01 |
| POST 🔄💰 | `/commitments/{commitment_id}/close` | 청산 확인 (최종 성과 고정) | BR-CLOSE-02 |

### 3-8. 캐피탈콜 · 납입 · 자금 계획
| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/capital-calls?status=unpaid\|overdue\|all` | 모든 출자 건의 캐피탈콜 (납입 상태 계산) | BR-CALL-05 |
| GET · POST | `/commitments/{commitment_id}/capital-calls` | 이 출자 건의 캐피탈콜 · 수기 등록 `{ call_no?, call_date, due_date, call_amount, purpose }` | BR-CALL-02, 03 |
| GET | `/capital-calls/{call_id}` | 캐피탈콜 상세 (우리 납입 합계·상태, GP가 본 상태) | BR-CALL-05 |
| POST 🔄 | `/capital-calls/{call_id}/cancel` | 수기 취소 | BR-CALL-04 |
| POST ✍💰 | `/capital-calls/{call_id}/payments` | 납입 만들기 + 결재 기안 `{ "amount", "planned_date", "request_comment" }` | BR-PAY-02, BR-APR-01 |
| POST 🔄💰 | `/payments/{payment_id}/mark-paid` | 송금 완료 기록 `{ "paid_date", "bank_reference" }` → 장부 + 대사 (4-2) | BR-PAY-03, 04 |
| GET | `/capital-calls/{call_id}/payments` | 이 캐피탈콜의 납입 (분할 납입 포함) | L9 |
| POST 🔄💰 | `/payments/{payment_id}/cancel` | 송금 전 취소, 또는 송금 기록 정정(원래 날짜 취소 행) `{ reason }`. 결재 대기는 `409 APPROVAL_PENDING` (결재권자가 반려, L31) | BR-PAY-05 |
| GET 👁 | `/cash-plan?from=YYYY-MM&months=12` | 자금 계획: 월별 **확정**(받은 캐피탈콜 미납 → 기한 달) + **추정**(남은 약정 ÷ 투자 기간 끝까지 월수). 기한 지난 미납 · 조회 기간 이후 · 투자 기간 이후 잔여 · 투자 기간 정보 없음 · 결성 대기 예정액을 따로 준다 ⚠️ | L29 |

### 3-9. 대사
| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/reconciliations?status=mismatched\|waiting\|resolved` | 현재 대사 상태 목록 (`waiting` = 7일 안의 불일치) | BR-REC-04, L10 |
| GET | `/commitments/{commitment_id}/reconciliations` | 한 출자 건의 대사 이력 | |
| POST 🔄 | `/reconciliations/{recon_id}/resolve` | 불일치 확인 `{ "resolution_memo" }`. 지금 상태인 불일치 행만 (지난 행이면 `409 CONFLICT`). 덮어쓰지 않고 `resolved` 행 추가 | BR-REC-05 |

### 3-10. 사후관리
| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/reports?unreviewed=true&fund_id=` · `/funds/{fund_id}/reports` | GP 보고 목록 (미검토 우선, 대체된 보고 표시, 최근 점검 결과와 판정 `pass | fail | reference`) | BR-RPT-05, L34 |
| POST | `/funds/{fund_id}/reports` | 수기 보고 등록 `{ …, "is_correction" }` | BR-RPT-02, 05 |
| GET | `/reports/{report_id}` | 보고 상세 (연동이면 GP 스냅샷 그대로) | |
| POST 🔄 | `/reports/{report_id}/review` | 검토 완료 | BR-RPT-04 |
| POST | `/reports/{report_id}/compliance-checks` | 조건 점검 기록 (연동은 비율 자동 채움) | BR-CHK-01 |
| GET | `/reports/{report_id}/attachments/{attachment_id}` | 보고서 PDF 내려받기 (연동은 GP에서 받아 흘려보냄). 수기 PDF 올리기는 고도화 | 03 4-10, L36 |
| GET | `/meetings?votable=true` | 총회 목록 (투표 가능·미제출 우선) | |
| POST | `/funds/{fund_id}/meetings` | 수기 총회·안건 등록 | |
| GET | `/meetings/{meeting_id}` | 안건 + 검토 의견 + 우리 찬반 + 결재·제출 상태 + 결과 | |
| PUT | `/meetings/{meeting_id}/votes` | 투표안 저장 `{ "votes": [{ "agenda_id", "choice", "review_opinion" }] }` (결재 전) | BR-VOTE-01, 03, BR-APR-03 |
| POST ✍ | `/meetings/{meeting_id}/vote-approvals` | 투표 결재 기안 → 승인되면 GP 제출 | BR-VOTE-02, 04 |
| POST 🔄 | `/meetings/{meeting_id}/mark-submitted` | 수기 총회 서면 제출 기록 | BR-VOTE-04 |
| POST 🔄 | `/meetings/{meeting_id}/resubmit` | GP 제출 다시 시도 (승인된 찬반 = 지금 찬반일 때만) | BR-SYNC-11, BR-VOTE-05 |
| POST | `/meetings/{meeting_id}/results` | 수기 총회 결과 기록 `{ results: [{ agenda_id, result }] }` → 개최 완료 | BR-VOTE-06 |
| GET · GET | `/notices?unacknowledged=true&type=&fund_id=` · `/notices/{notice_id}` | 통지함 · 상세 | |
| POST | `/notices` | 수기 통지 기록 | BR-NTC-01 |
| POST 🔄 | `/notices/{notice_id}/acknowledge` | 확인 (연동이면 GP에 전달). 응답 `gp_sync { status: sent | pending | not_needed }` | BR-NTC-02 |

### 3-11. 분배
| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/distributions?status=announced\|received\|all` · `/distributions/{distribution_id}` | 분배 목록 (기본 수령 대기) · 상세 (원금 반환·수익, GP 단계별, GP가 본 상태) | L39, L41 |
| GET · POST | `/commitments/{commitment_id}/distributions` | 출자 건 분배 · 수기 등록 `{ distribution_no?, distribution_date, return_of_capital_amount, profit_amount, is_final }` | BR-DIST-02 |
| POST 🔄💰 | `/distributions/{distribution_id}/receive` | 수령 기록 `{ "received_date" }` → 장부 + 대사 | BR-DIST-03 |
| POST 🔄💰 | `/distributions/{distribution_id}/cancel-receipt` | 수령 기록 정정 (원래 날짜 취소 행) | BR-DIST-05 |

### 3-12. 성과 · 대시보드
| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/performance?as_of=&group_by=vintage\|strategy\|gp\|source` | 포트폴리오 합계와 묶음별 TVPI·DPI·RVPI·IRR (4-4) | BR-PERF-01~06 |
| GET | `/commitments/{commitment_id}/performance?as_of=` | 출자 건 성과 + 현금흐름 목록 (IRR 근거) | BR-PERF-04 |
| GET | `/dashboard` | `{ today, budget, portfolio, cash: { month, this_month, overdue_unpaid, months }, schedule: [{ date, kind, title, detail, href }], alerts: [{ key, label, tone, items }] }`. budget = 올해 예산(예산 화면과 같은 값, 없으면 null), portfolio = 성과 화면 '전체' 행, cash = 자금 계획 12개월, schedule = 오늘~30일 기한·예정일(납입 기한·총회·분배일·결성 기한·접수 마감·보고 기한) (R5-4, R7-1) | 04 14장 |
| POST 🔄 | `/funds/{fund_id}/key-person-review` | 핵심 운용 인력 변경 확인 (주의 목록에서 빠짐) | L37 |

### 3-13. GP 연동 관리 (관리자)
| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/integration` | 연결된 GP, 우리 기관 연결(`gp_lp_id` 는 앞 8자리만), 받은 이벤트 현황(처리·실패·무시), 못 보낸 것 | |
| GET | `/integration/events?status=failed` | 우리 기관 관련 받은 이벤트 | BR-SYNC-07 |
| POST 🔄 | `/integration/events/{event_id}/retry` | 실패 이벤트 다시 처리 | BR-SYNC-07 |
| POST 🔄 | `/integration/pull` | 놓친 이벤트 지금 가져오기 + 처리 | BR-SYNC-08 |
| POST 🔄 | `/integration/send-pending` | 못 보낸 응답·확인·투표 지금 보내기 (R3-5는 제안 응답만. GP 거부는 제외). 응답 `{ sent, pending, rejected }` | BR-SYNC-11 |

> 연동 **설정**(GP 주소·키 변수 이름·기관 연결)은 기관이 아니라 서비스 운영자가 정하므로 API가 없다. MVP에서는 설정 스크립트로 넣는다 ⚠️.
> `npm run gp:link -- --org a --gp-lp-id <GP 출자자 ID>` — 연결(없으면 생성, 환경 변수 `GP_DEMO_BASE_URL`·`GP_DEMO_API_KEY`·`GP_DEMO_WEBHOOK_SECRET`) → GP `GET /lps/{id}` 로 확인 → 기관의 운용사 목록에 연동 GP(기본 이름 'VC ERP 데모 운용사') → 기관 연결. 다시 실행해도 같은 결과 (R3-2)

---

## 4. 대표 API 상세

### 4-1. 선정: 점검 → 기안 → 승인

**점검** `GET /proposals/{id}/selection-check`
```json
{
  "data": {
    "can_request": false,
    "checks": [
      { "rule": "BR-SEL-01", "label": "선정 조건 작성", "ok": true },
      { "rule": "BR-SEL-02", "label": "심사 평가 1건 이상", "ok": true },
      { "rule": "BR-BUD-04", "label": "2026년 예산 잔액", "ok": false,
        "details": { "budget_amount": 50000000000, "used_amount": 45000000000, "planned_amount": 7000000000 } },
      { "rule": "BR-PRG-05", "label": "초기 부문 출자 예정액", "ok": true },
      { "rule": "BR-BUD-05", "label": "초기 분야 배분", "ok": true, "warning": "배분 대비 112%" }
    ]
  }
}
```

**승인** `POST /approvals/{id}/approve` (선정)
```json
{
  "data": {
    "approval": { "id": "…", "status": "approved", "decided_at": "2026-10-05T10:02:11+09:00" },
    "proposal": { "id": "…", "status": "selected", "decided_date": "2026-10-05" },
    "commitment": { "id": "…", "status": "awaiting_formation" },
    "gp_sync": { "status": "sent", "gp_proposal_status": "committed" }
  }
}
```
- 한 트랜잭션: 예산 다시 검사(잠금) → 결재 승인 → 제안 선정 → 선정 조건 잠금 → 출자 건 생성 (BR-SEL-03)
- 트랜잭션 후 연동 제안이면 GP에 응답 (5-2). 실패하면 `"gp_sync": { "status": "pending" }` 이고 나중에 다시 보낸다
- 예산 초과면 `422 BUDGET_EXCEEDED` (기안 뒤 다른 선정이 먼저 승인된 경우)

### 4-2. 납입: 기안 → 승인 → 송금 완료

```
POST /capital-calls/{call_id}/payments      💰  → payment(requested) + approval(pending)
POST /approvals/{approval_id}/approve       💰  → payment(approved)
POST /payments/{payment_id}/mark-paid       💰  → payment(paid) + 장부 + 대사
```

**송금 완료** 응답
```json
{
  "data": {
    "payment": { "id": "…", "status": "paid", "amount": 600000000, "paid_date": "2027-03-10" },
    "capital_call": { "call_no": 2, "call_amount": 600000000, "paid_amount": 600000000, "payment_status": "paid" },
    "reconciliation": { "entry_type": "contribution", "our_amount": 1200000000, "gp_amount": 600000000,
                        "recon_status": "mismatched", "waiting_until": "2027-03-17" }
  }
}
```
> 송금 직후에는 GP가 아직 입금을 확인하지 않아 불일치가 정상이다. `waiting_until` 까지는 경고하지 않는다 (L10).
> GP가 입금을 확인하면 `ledger.entry_created` 이벤트 → 사본 추가 → 대사 `matched`.

### 4-3. 웹훅 받기

```
POST /api/webhooks/gp/{connection_id}
X-GP-Event-Id: 5c0e…
X-GP-Timestamp: 2027-03-10T10:15:00+09:00
X-GP-Signature: sha256=8f2a…
```

| 순서 | 처리 | 실패하면 |
|---|---|---|
| 1 | 연결 찾기 (`connection_id`) | `404` |
| 2 | 서명 확인: `HMAC-SHA256(환경 변수[webhook_secret_env], 타임스탬프 + "." + 본문)` | `401` (저장 안 함) |
| 3 | 타임스탬프 5분 이내 | `401` |
| 4 | `inbound_events` 에 저장 (`gp_event_id` 유일) | 이미 있으면 그냥 `200` |
| 5 | `200` 응답 — **여기까지만** 하고 끝 | |
| 6 | (응답 후) 처리 작업 실행 → 기관 찾기 → GP API 다시 읽기 → 반영 → 대사 | `failed`, 재시도 (BR-SYNC-07) |

> 6번은 Next.js의 `after()`(응답을 보낸 뒤 이어서 실행)로 바로 시작하고, 놓친 것은 주기 작업이 처리한다.
> 웹훅 주소는 GP 쪽 설정 `LP_SYSTEM_WEBHOOK_URL` 에 넣는다 (🔗 GP BR-EVT-06).

### 4-4. 성과 조회

`GET /performance?as_of=2027-12-31&group_by=vintage`
```json
{
  "data": {
    "as_of": "2027-12-31",
    "total": { "commitment_amount": 30000000000, "contribution_amount": 12400000000, "distribution_amount": 1800000000,
               "nav_amount": 13900000000, "tvpi": 1.27, "dpi": 0.15, "rvpi": 1.12, "irr": 0.118, "count": 6 },
    "groups": [
      { "key": "2025", "tvpi": 1.41, "dpi": 0.29, "irr": 0.152, "count": 2, "nav_missing_count": 0 },
      { "key": "2026", "tvpi": 1.08, "dpi": 0.0, "irr": null, "count": 4, "nav_missing_count": 1 }
    ]
  }
}
```
- 배수·IRR은 **금액 합계로 다시 계산**한다 (평균의 평균이 아님, BR-PERF-05)
- `irr: null` 은 계산하지 않은 것 (첫 납입 후 90일 미만 등, BR-PERF-04)
- `nav_missing_count`: 평가액 보고가 없어 0으로 계산한 출자 건 수 (BR-PERF-02)

### 4-5. GP 호출 방식 (LP ERP → GP)

모든 GP 호출은 한 함수(`lib/gp/client.ts`)를 거친다.

```ts
gpClient(orgId, gpId)          // ① gp_lp_links 에서 이 기관의 gp_lp_id, 연결 정보를 찾는다 (없으면 GP_NOT_LINKED)
  .get(`/funds/${gpFundId}/ledger`)   // ② 주소 앞에 /lps/{gp_lp_id} 를 스스로 붙인다
```
- 호출하는 코드는 `lp_id` 를 **넘길 수 없다**. 함수가 기관 연결에서만 꺼낸다 (BR-ORG-05)
- API 키는 `process.env[connection.api_key_env]` 에서 읽는다 (DB에 없음)
- 10초 제한, 실패는 `GP_UNAVAILABLE` 로 바꿔 호출한 쪽이 "나중에 다시 보내기"로 처리
- 호출마다 감사 로그 (BR-AUTH-04)

---

## 5. GP 시스템에 추가할 API (L5)

GP 저장소(`vc-erp/gp`)에 구현하고 GP 문서(05 API 설계 5-2, 99 결정 기록 D45)에도 남긴다.
모두 GP LP 연동 API의 기존 규칙(API 키 인증, 공개 등급, 감사 로그)을 따른다.

### 5-1. 출자 제안 목록 (새 API)

`GET /api/lp/v1/lps/{lp_id}/proposals` — 🟢 본인 것만. **조합원이 되기 전**에도 조회된다 (제안은 결성 전 일이므로).
```json
{
  "data": [
    {
      "id": "…", "status": "reviewing", "proposed_amount": 5000000000, "loc_amount": null,
      "proposed_date": "2026-10-01", "decided_date": null, "decided_via": null,
      "fund": { "id": "…", "name": "그로스 2호 조합", "fund_type": "venture", "gp_type": "venture_capital",
                "status": "fundraising", "target_amount": 30000000000, "term_years": 8, "investment_period_years": 4,
                "terms": { "management_fee_rate": 0.02, "carry_rate": 0.2, "hurdle_rate": 0.07,
                           "primary_purpose": "초기 창업기업", "primary_purpose_min_ratio": 0.6 },
                "managers": [{ "name": "…", "role": "lead" }] }
    }
  ]
}
```
> **발송한 제안만** 준다 (발송 전 제안은 GP 내부 작업). 2026-10-01 구현 (GP D45).
> 지금 GP의 조합 상세 API는 조합원만 볼 수 있어서, 결성 전 제안 단계의 조합 계획을 LP가 읽을 길이 없다. 그래서 제안 응답 안에 **제안 검토에 필요한 조합 정보만** 담는다 (GP 내부 메모 제외).

### 5-2. 출자 제안 응답 (새 API)

`PUT /api/lp/v1/lps/{lp_id}/proposals/{proposal_id}/response`
```json
{ "decision": "committed", "loc_amount": 5000000000, "decided_date": "2026-10-05" }
```
| `decision` | GP 제안 상태 | 조건 (🔗 GP 규칙) |
|---|---|---|
| `reviewing` | `proposed → reviewing` | 이미 `reviewing` 이면 그대로 200 |
| `committed` | `→ committed`, 확약 금액 기록 | `loc_amount > 0` (BR-PROP-02), 결정일 ≥ 제안일 (BR-PROP-06) |
| `declined` | `→ declined` | |

- **같은 요청을 다시 보내면 결과가 같다**: 이미 같은 상태·같은 금액이면 바꾸지 않고 `200` + `changed: false` (BR-SYNC-12). 응답은 그 제안(5-1과 같은 모양)
- 형식 오류(확약인데 금액 없음, 거절인데 금액 있음, 알 수 없는 `decision`)는 `400 VALIDATION_ERROR`, 결정일 < 제안일은 `422 INVALID_DATE`, 발송 안 한·다른 출자자의 제안은 `404`
- 다른 결정으로 바꾸려 하면 `409 PROPOSAL_CLOSED` (GP BR-PROP-01: 확약·거절은 되돌릴 수 없음)
- 조합이 기획·모집 중일 때만 (GP BR-PROP-05)
- GP `lp_proposals` 에 `decided_via`(`gp` / `lp_system`)를 더해, GP 화면에 "LP 직접" 으로 표시한다 (🔗 GP D40 투표 `channel` 과 같은 방식). 결성 전까지 GP가 확약 금액을 고치는 것(GP BR-PROP-01)은 그대로 허용한다 ⚠️
- 이 요청은 LP 시스템 자신이 한 것이라 웹훅 이벤트를 만들지 않는다 (🔗 GP D40과 같은 이유)

### 5-3. 보고 응답에 우리 몫 평가액 (기존 API에 필드 추가, L8)

`GET /api/lp/v1/lps/{lp_id}/funds/{fund_id}/reports` 각 보고에 `my` 를 더한다.
```json
{ "id": "…", "period_end": "2027-12-31", "is_correction": false, "snapshot": { … },
  "my": { "ownership_ratio": 0.2, "nav_amount": 2780000000 } }
```
- `nav_amount` = (스냅샷의 보유 기업 평가액 + 현금 잔액) × 기준일(`period_end`)의 내 지분율, 원 미만 버림
- GP 스냅샷의 TVPI가 쓰는 "잔여 가치 = 평가액 + 현금"과 같은 정의 (🔗 GP `reports.ts`)
- 지분율은 GP D4대로 약정액 기준 ⚠️
- 필드 추가라 기존 연동과 호환된다
- `is_correction` 도 함께 내려준다 (LP ERP BR-RPT-05)

### 5-4. 조합 정보에 의무 비율 + 운용 인력 변경 이벤트 (기존 API 보완)

- `GET /api/lp/v1/lps/{lp_id}/funds/{fund_id}` 의 `terms` 에 `primary_purpose_min_ratio` 추가 (LP ERP BR-CHK-01)
- GP에서 조합 운용 인력을 지정·교체할 때 `fund.updated` 이벤트를 만든다. 지금은 이벤트가 없어 LP가 핵심 운용 인력 변경을 알 수 없다 (GP 코드 확인)

---

## 6. 주기 작업

| 주소 | 하는 일 | 주기 |
|---|---|---|
| `GET /api/cron/sync` | ① 놓친 이벤트 가져오기 (연결별) ② 받은 이벤트 처리·재시도 ③ 못 보낸 응답·확인·투표 보내기 | 하루 1회 (무료 요금제) ⚠️ |

- `CRON_SECRET` Bearer 인증, `scheduled_jobs` 실행 잠금 (🔗 GP D41과 같은 방식)
- 실제로는 웹훅이 오면 바로 처리하므로(4-3), 주기 작업은 **놓친 것을 메우는 안전망**이다

---

## 7. Next.js 구현 위치

GP와 같은 구조에 LP ERP 전용 폴더를 더한다.

```
app/api/
├─ v1/…                         ① 내부 API
├─ webhooks/gp/[connection_id]/route.ts   ② 웹훅 받기
└─ cron/sync/route.ts           ④ 주기 작업
lib/
├─ api/        응답·오류, withOrgUser(기관+역할), 멱등성 키
├─ services/   SQL. 모든 함수의 첫 인자는 orgId (BR-ORG-02)
├─ rules/      예산·결재·결성 확인·성과 지표(IRR) 계산
└─ gp/         client.ts(GP 호출), sync.ts(이벤트 처리), outbound.ts(보내기), signature.ts
```

---

## 8. 이 문서에서 내린 결정 (확정)

- **L13 공통 규칙은 GP와 같다**: REST, snake_case, 동작 API, 멱등성 키, 미리보기 API (GP D20~D23, D26)
- **L14 주소에 기관 ID를 넣지 않는다**: 세션의 기관이 곧 범위. 빠뜨릴 검사 자체를 없앤다
- **L15 웹훅은 저장 후 바로 응답, 처리는 따로**: GP의 10초 제한과 재전송 규칙에 맞춘다. 처리는 응답 후 바로 + 주기 작업이 안전망
- **L16 GP 호출은 한 함수로만**: `lp_id` 를 호출 코드가 넘길 수 없게 해 기관 분리를 연동 쪽에서도 지킨다
- **L17 GP 추가 API 4가지**: 제안 목록, 제안 응답(`decided_via` 포함), 보고의 우리 몫 평가액, 의무 비율·운용 인력 변경 이벤트
