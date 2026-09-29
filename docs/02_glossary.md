# 02. 용어 정의 (확정)

> 2026-09-29 검수: 역할 4개, 심사 단계 건너뛰기 허용(04에서 규칙화), 빈티지 = 결성 연도, 분야 5개 고정값으로 확정

## 이 문서의 목적

GP 시스템과 같다. **용어 하나당 한국어 표준어 하나, 코드 이름 하나**로 고정하고, 이후 모든 문서와 코드는 이 표의 이름만 쓴다.
LP ERP는 GP와 데이터를 주고받으므로, **같은 개념은 GP와 같은 말**을 쓰고 GP 쪽 이름도 함께 적는다.

> ⚠️ 표시는 실무 확인이 필요한 정의다.
> 🔗 표시는 GP 시스템의 같은 개념이다 (GP 02 용어 정의 참고).

---

## 0. 이름 규칙

GP 02 용어 정의 0장과 같다. 요약하면:

- 테이블은 영어 복수형, 컬럼은 단수형, 소문자 + 밑줄
- 금액 `_amount` (**원 단위 정수**), 비율 `_rate`(약정된 요율) / `_ratio`(계산된 비중), 날짜 `_date`, 일시 `_at`, 구분값 `_type`, 상태 `status`
- 화면·문서의 표준어는 **"조합"**, 코드 이름은 `fund` (GP D30과 같음)

LP ERP에만 있는 규칙:

| 대상 | 규칙 | 예시 |
|---|---|---|
| 기관 ID | 기관이 만든 모든 테이블에 `org_id` (L2) | `proposals.org_id` |
| 데이터 출처 | GP에서 받을 수 있는 데이터에 `data_source` | `gp_api` / `manual` |
| GP 쪽 ID | GP 시스템의 ID를 저장할 때 `gp_` 로 시작 | `gp_fund_id`, `gp_lp_id`, `gp_event_id` |

**"우리"의 뜻**: 이 문서에서 "우리"는 **LP ERP를 쓰는 출자기관**이다. GP 문서의 "우리"(운용사)와 반대다.

---

## 1. 주체

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| 기관 | 출자기관, LP, 고객사 | `orgs` | LP ERP를 쓰는 출자기관 한 곳. 데이터 분리의 단위 (L2). 🔗 GP의 출자자(`limited_partners`) 중 기관 |
| 기관 유형 | | `org_type` | `policy`(정책 출자기관) / `pension`(연기금·공제회) / `financial`(금융기관) / `corporate`(일반 기업) / `other`. 🔗 GP의 `lp_type` 에서 `individual` 을 뺀 것 |
| 사용자 | 담당자 | `users` | 기관 소속으로 로그인하는 사람. 한 사용자는 한 기관에만 속한다 |
| 사용자 역할 | 권한 | `user_role` | `admin`(관리자) / `officer`(출자 담당) / `approver`(결재권자) / `viewer`(조회) ⚠️ 권한 세부는 04 비즈니스 규칙에서 |
| 운용사 | GP, 업무집행조합원 | `gps` | 우리가 출자했거나 출자를 검토하는 GP. **기관마다 따로** 관리한다 |
| 운용사 유형 | 결성 주체 | `gp_type` | 🔗 GP의 `gp_type` 과 같은 값: `accelerator` / `venture_capital` / `new_tech_finance` / `other` |

## 2. 출자 계획

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| 출자 예산 | 연간 출자 계획 | `budgets` | 기관이 한 해 동안 새로 출자(선정)할 수 있는 총액. 연도 × 기관 단위 |
| 예산 연도 | | `budget_year` | 예산이 적용되는 해 |
| 분야 | 출자 분야, 전략 | `strategy` | 조합의 투자 성격. `early`(초기) / `growth`(성장) / `secondary`(세컨더리) / `overseas`(해외) / `other` ⚠️ 기관마다 분류가 다름 |
| 분야별 배분 | | `budget_allocations` | 예산 중 분야별로 배정한 금액 |
| 예산 잔액 | | (계산값) | 예산 − 그해 선정액 합계. 음수가 되는 선정은 차단 |

## 3. 출자사업 · 출자 제안

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| 출자사업 | 출자사업 공고, 정기 출자사업 | `programs` | 기관이 GP를 공개 모집하는 공고 1건 (L3) |
| 모집 부문 | 출자 분야 | `program_tracks` | 출자사업 안의 부문. 분야, 출자 예정액, 선정 GP 수, 최소 결성 규모, 출자 비율 상한을 가진다 |
| 접수 기간 | | `apply_start_date` / `apply_end_date` | 제안을 받는 기간 |
| 출자 제안 | 제안서, 출자 요청 | `proposals` | GP가 우리에게 출자를 요청한 1건. 조합 × 기관 단위. 🔗 GP의 `lp_proposals` (같은 건을 반대편에서 본 것) |
| 제안 경로 | | `proposal_channel` | `program`(출자사업 공고 접수) / `direct`(개별 제안) |
| 요청 출자액 | 제안 금액 | `requested_amount` | GP가 출자해 달라고 요청한 금액. 🔗 GP의 `proposed_amount` |
| 제안 상태 | 심사 단계 | `proposal_status` | 아래 참고 |

**제안 상태 (`proposal_status`)**

```
received(접수) → screening(서류 심사) → due_diligence(현장 실사) → presentation(대면 심사)
  → committee(투자심의위원회) → selected(선정)
어느 단계에서든 → rejected(탈락) / withdrawn(GP 철회)
```

- ⚠️ 기관마다 심사 단계가 달라, 중간 단계를 건너뛰는 것은 허용할지 04 비즈니스 규칙에서 정한다
- `selected` 는 **선정 결재가 승인된 뒤**에만 된다 (L4)
- 🔗 연동 GP 제안이면 `selected` → GP의 `committed`(확약), `rejected` → GP의 `declined`(거절) 로 전달 (L5)

## 4. 심사

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| 평가 항목 | 심사 기준 | `evaluation_criteria` | 기관이 정한 채점 항목과 가중치 (예: 운용 인력 30%, 운용 성과 25%) ⚠️ |
| 가중치 | | `weight_ratio` | 항목이 총점에서 차지하는 비중. 항목 합계 = 1 |
| 평가표 | 심사 평가 | `evaluations` | 심사위원 한 명이 제안 한 건을 채점한 것 |
| 점수 | | `score` | 항목별 점수 (0~100) |
| 가중 점수 | 종합 점수 | (계산값) | Σ(점수 × 가중치). 제안별로는 심사위원 평균 |
| 선정 조건 | | `selection_terms` | 선정할 때 붙인 조건: 출자 예정액, 출자 비율 상한, 결성 기한, 핵심 운용 인력 유지 조건 ⚠️ |
| 출자 예정액 | 선정액, 출자 확약액 | `planned_amount` | 선정 시 출자하기로 정한 금액. 🔗 GP의 `loc_amount`(출자확약)로 전달된다 |
| 출자 비율 상한 | | `max_commitment_ratio` | 조합 결성액 중 우리 약정이 넘으면 안 되는 비율 (예: 0.4 = 40%) |
| 결성 기한 | | `formation_deadline` | 이 날까지 조합이 결성되지 않으면 선정 취소 대상 ⚠️ |

## 5. 결재 (L4)

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| 결재 | 품의, 승인 요청 | `approvals` | 업무 한 건을 결재권자에게 승인받는 절차 1건 |
| 결재 대상 | | `approval_target_type` | `selection`(출자 선정) / `payment`(납입) / `vote`(총회 투표) |
| 기안자 | 요청자 | `requested_by` | 결재를 올린 사용자. 자기 건을 결재할 수 없다 |
| 결재자 | 결재권자 | `approver_id` | 승인·반려하는 사용자 |
| 결재 상태 | | `approval_status` | `pending`(결재 대기) → `approved`(승인) / `rejected`(반려). 반려되면 새 결재로 다시 올린다 |

## 6. 조합 · 약정

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| 조합 | 펀드, 투자조합 | `funds` | 우리가 출자했거나 검토 중인 조합. **기관마다 따로** 관리한다. 🔗 GP의 `funds` |
| GP 쪽 조합 ID | | `gp_fund_id` | 연동 조합일 때 GP 시스템의 조합 ID. 수기 조합이면 비어 있음 |
| 데이터 출처 | | `data_source` | `gp_api`(연동 GP에서 받음) / `manual`(담당자가 입력) |
| 조합 상태 | | `fund_status` | 🔗 GP와 같은 값: `planning` / `fundraising` / `formed` / `operating` / `dissolved` / `liquidated`. 연동 조합은 GP 값을 따르고, 수기 조합은 담당자가 바꾼다 |
| 결성액 | 약정 총액, 조합 규모 | `fund_size_amount` | 조합 전체 조합원의 약정액 합계. 🔗 GP의 `total_commitment_amount` |
| 결성일 | | `formation_date` | 🔗 GP와 같음 |
| 빈티지 | 결성 연도 | `vintage_year` | 성과 비교용 기준 연도. 결성일의 연도 ⚠️ 최초 납입 연도를 쓰는 기관도 있음 |
| 출자 건 | 출자 약정 건 | `commitments` | 우리 기관 × 조합 하나에 대한 출자. 선정되면 생기고, 약정·납입·분배·성과가 모두 여기에 붙는다 |
| 약정액 | 출자 약정액 | `commitment_amount` | 결성 때 확정된 우리 약정 금액. 🔗 GP 원장의 `commitment` |
| 지분율 | 출자 비율 | `ownership_ratio` | 약정액 ÷ 결성액 (계산값). 🔗 GP와 같음 |
| 출자 건 상태 | | `commitment_status` | 아래 참고 |

**출자 건 상태 (`commitment_status`)**

```
awaiting_formation(결성 대기) → active(약정 확정) → closed(청산 완료)
awaiting_formation → cancelled(선정 취소)
```

- `awaiting_formation`: 선정했지만 조합이 아직 결성되지 않음. 결성 기한 관리 대상
- `active`: 결성 확인이 끝나 약정액이 확정됨. 납입·분배가 이 상태에서만 가능
- `closed`: 조합 청산 후 최종 성과를 고정함

## 7. 납입 · 장부 · 대사

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| 캐피탈콜 | 출자 요청, 납입 요청 | `capital_calls` | GP가 우리에게 약정액 중 일부를 넣어 달라고 한 요청 1건. 🔗 GP의 `capital_call_items`(조합원별 요청) 중 우리 몫 |
| 회차 | | `call_no` | 조합의 몇 번째 캐피탈콜인지. 🔗 GP와 같음 |
| 요청액 | | `call_amount` | 🔗 GP와 같음 |
| 납입 기한 | | `due_date` | 🔗 GP와 같음 |
| 납입 | 출자금 납입 | `payments` | 우리가 실제로 GP 조합에 돈을 보낸 것. 납입 결재가 승인된 뒤에만 기록 |
| 우리 장부 | LP 원장, 출자 원장 | `ledger_entries` | 우리 기관 기준의 약정·납입·분배 기록. 추가만 허용 (🔗 GP D5와 같은 원칙) |
| 장부 구분 | | `entry_type` | 🔗 GP와 같은 값: `commitment` / `contribution` / `distribution` |
| GP 원장 사본 | | `gp_ledger_entries` | 연동 GP가 보낸 우리 몫의 원장. 받은 그대로 저장, 고치지 않음 (L6). 🔗 GP의 `ledger_entries` |
| 대사 | 맞춰보기, 리컨 | `reconciliations` | 우리 장부와 GP 원장의 합계를 비교한 결과 1건 |
| 대사 상태 | | `recon_status` | `matched`(일치) / `mismatched`(불일치) / `resolved`(불일치 확인 완료, 메모 필수) |
| 남은 약정액 | 미납 약정, 언펀디드 | `unfunded_amount` | 약정액 − 누적 요청액 (계산값). 🔗 GP와 같음 |
| 자금 계획 | 납입 예측 | (계산값) | 남은 약정액이 앞으로 언제 얼마나 요청될지 추정한 월·분기별 금액 ⚠️ 추정 방식 단순화 |

## 8. 사후관리

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| GP 보고 | 정기 보고, 운용 보고 | `reports` | GP가 보낸 조합 현황 보고 1건. 🔗 GP의 `reports`(발행 스냅샷) |
| 보고 기한 | | `report_due_date` | 이 날까지 보고가 오지 않으면 경고 ⚠️ 기한 기준(분기 말 + N일) |
| 평가액 | 잔여 가치, NAV | `nav_amount` | 기준일 현재 우리 몫의 조합 가치. 보고서 숫자로 기록 ⚠️ 평가 기준 |
| 조건 준수 점검 | 사후 점검 | `compliance_checks` | 의무투자 비율 등 약정 조건을 보고서 숫자로 확인한 기록 ⚠️ |
| 총회 | 조합원 총회 | `meetings` | 🔗 GP의 `general_meetings` |
| 안건 | | `agendas` | 🔗 GP와 같음 |
| 검토 의견 | | `review_opinion` | 안건에 대해 담당자가 쓴 내부 의견. GP에 보내지 않는다 |
| 투표 | 의결권 행사 | `votes` | 안건 1건에 대한 우리 찬반. `for`(찬성) / `against`(반대) / `abstain`(기권). 🔗 GP의 `votes` (연동이면 `channel = lp_system` 으로 기록됨) |
| 통지 | 공지 | `notices` | GP에게서 받은 알림 1건. 🔗 GP의 `notices` |
| 통지 확인 | | `acknowledged_at` | 우리가 확인한 시각. 연동 GP면 GP에도 전달 |
| 주의 목록 | 알림, 할 일 | (계산값) | 납입 기한 임박, 대사 불일치, 보고 미제출, 결성 기한, 핵심 운용 인력 변경, 결재 대기 |

## 9. 분배 · 성과

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| 분배 | 배분 | `distributions` | GP가 우리에게 돌려준 돈 1건. 🔗 GP의 `distribution_items` 중 우리 몫 |
| 원금 반환액 | | `return_of_capital_amount` | 분배 중 납입 원금을 돌려받은 부분 |
| 수익 분배액 | | `profit_amount` | 분배 중 원금을 넘는 수익 부분 |
| 수령일 | | `received_date` | 실제로 돈이 들어온 날 |
| TVPI | 총가치 배수 | (계산값) | (누적 분배 + 평가액) ÷ 누적 납입 |
| DPI | 분배 배수 | (계산값) | 누적 분배 ÷ 누적 납입. 실제로 돌려받은 비율 |
| RVPI | 잔여 가치 배수 | (계산값) | 평가액 ÷ 누적 납입. TVPI = DPI + RVPI |
| IRR | 내부수익률 | (계산값) | 납입(−)·분배(+)·기준일 평가액(+)의 날짜별 현금흐름으로 계산한 연 수익률 ⚠️ 기준일·평가액 시점 단순화 |
| 성과 기준일 | | `as_of_date` | 성과 지표를 계산하는 날짜. 평가액은 이 날 이전 가장 최근 보고 값 |

## 10. GP 연동

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| GP 연동 | 연결 | `gp_connections` | LP ERP 전체와 GP 시스템 하나의 연결 설정 (주소, API 키, 웹훅 서명 비밀 값). 기관이 아니라 **서비스 운영자**가 관리한다 |
| 기관 연결 | 출자자 매핑 | `gp_lp_links` | "우리 기관 = 이 GP 시스템의 어떤 출자자(`gp_lp_id`)" 연결표. 기관은 자기 연결의 `gp_lp_id` 로만 GP를 호출할 수 있다 |
| 받은 이벤트 | 수신 웹훅 | `inbound_events` | GP에게서 받은 이벤트 1건. `gp_event_id` 로 중복을 거른다 |
| 처리 상태 | | `inbound_status` | `received`(받음) → `processed`(반영) / `failed`(반영 실패, 다시 시도) / `ignored`(연결된 기관 없음) |
| 동기화 위치 | 커서 | `last_gp_event_id` | 놓친 이벤트를 다시 받을 때 어디서부터 받을지 (`GET /events?after=`) |
| 출자 제안 응답 | | (GP 새 API, L5) | LP ERP가 GP에게 보내는 선정(확약 금액) / 탈락(거절) 결과 |
