-- =============================================================================
-- 001_schema.sql — VC ERP (LP) 최초 스키마
-- =============================================================================
-- 기준 문서
--   docs/02_glossary.md       이름 규칙과 상태값 (🔗 GP와 같은 값은 GP DB의 check 값과 맞춤)
--   docs/03_db_design.md      테이블 36개, 설계 원칙
--   docs/04_business_rules.md DB가 직접 막는 규칙
--
-- 공통 규칙
--   · 기본 키: uuid (gen_random_uuid)
--   · 금액: bigint, 원 단위 정수 / 비율: numeric(7,6), 0 이상 1 이하
--   · 상태·구분값: text + check 제약
--
-- 기관 분리 (L2, 03 원칙 1)
--   · 기관이 만든 모든 테이블에 org_id 를 두고, (org_id, id) 를 유일하게 한다
--   · 다른 테이블을 가리킬 때는 (org_id, 대상 id) 두 개를 함께 가리킨다 (복합 외래 키)
--     → 서버가 기관 검사를 빠뜨려도, 기관이 다른 행끼리는 DB가 연결을 거부한다
--   · 예외: orgs, sessions, gp_connections, inbound_events, scheduled_jobs (기관에 속하지 않음)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. 공통 함수
-- -----------------------------------------------------------------------------

-- 행이 수정될 때 updated_at 을 현재 시각으로 바꾼다
create function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 추가만 허용하는 테이블에서 수정·삭제를 막는다 (03 원칙 4)
create function forbid_modification() returns trigger
language plpgsql as $$
begin
  raise exception '% 테이블은 수정·삭제할 수 없습니다. 정정은 취소 행을 추가하세요.', tg_table_name
    using errcode = 'restrict_violation';
end;
$$;


-- =============================================================================
-- 1. 기관 · 계정
-- =============================================================================

create table orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  org_type   text not null check (org_type in ('policy', 'pension', 'financial', 'corporate', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table orgs is '기관 (LP ERP를 쓰는 출자기관, 데이터 분리의 단위)';

create table users (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id),
  email         text not null unique,      -- 서비스 전체에서 유일 (로그인할 때 기관을 고르지 않게)
  name          text not null,
  password_hash text not null,             -- 원문 비밀번호는 저장하지 않는다
  role          text not null default 'officer' check (role in ('admin', 'officer', 'approver', 'viewer')),
  disabled_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (org_id, id)
);
comment on table users is '사용자 (한 사용자는 한 기관에만 속한다)';

-- 브라우저 쿠키에는 무작위 토큰만, DB에는 SHA-256 지문만 저장한다 (🔗 GP D27)
create table sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  created_at timestamptz not null default now(),

  constraint expires_after_created check (expires_at > created_at)
);
create index on sessions (user_id);
comment on table sessions is '로그인 세션 (기관은 사용자에서 정해진다)';


-- =============================================================================
-- 2. GP 연동 설정 · 운용사 · 조합
-- =============================================================================

-- LP ERP 전체 ↔ GP 시스템 하나의 연결. 서비스 운영자가 설정 스크립트로 넣는다
create table gp_connections (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null unique,
  base_url           text not null,          -- 예: https://vc-erp-gp.vercel.app/api/lp/v1
  api_key_env        text not null,          -- 비밀 값이 아니라 환경 변수 이름 (예: GP_DEMO_API_KEY)
  webhook_secret_env text not null,
  last_gp_event_id   uuid,                   -- 놓친 이벤트를 가져올 시작 위치
  last_pulled_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table gp_connections is 'GP 시스템 연동 설정 (비밀 값은 환경 변수에만)';

create table gps (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id),
  name             text not null,
  gp_type          text not null check (gp_type in ('accelerator', 'venture_capital', 'new_tech_finance', 'other')),
  aum_amount       bigint check (aum_amount >= 0),
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  gp_connection_id uuid references gp_connections(id),   -- 연동 GP면 채움
  memo             text,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (org_id, id),
  unique (org_id, name),
  foreign key (org_id, created_by) references users(org_id, id)
);
comment on table gps is '운용사 (기관마다 따로 관리)';

-- 우리 기관 = 연동 GP의 어떤 출자자인지. 기관 분리의 연동 쪽 핵심 (BR-ORG-05)
create table gp_lp_links (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id),
  gp_connection_id uuid not null references gp_connections(id),
  gp_lp_id         uuid not null,          -- GP 시스템의 limited_partners.id
  gp_id            uuid not null,
  created_at       timestamptz not null default now(),

  unique (org_id, gp_connection_id),       -- 한 GP에서 기관은 출자자 하나
  unique (gp_connection_id, gp_lp_id),     -- GP 출자자 하나는 기관 하나에만
  foreign key (org_id, gp_id) references gps(org_id, id)
);
comment on table gp_lp_links is '기관 ↔ 연동 GP의 출자자 연결 (1:1)';

create table funds (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references orgs(id),
  gp_id                     uuid not null,
  name                      text not null,
  fund_type                 text not null check (fund_type in ('venture', 'individual', 'new_tech')),
  strategy                  text not null check (strategy in ('early', 'growth', 'secondary', 'overseas', 'other')),
  status                    text not null default 'fundraising'
                            check (status in ('planning', 'fundraising', 'formed', 'operating', 'dissolved', 'liquidated')),
  target_amount             bigint check (target_amount > 0),
  fund_size_amount          bigint check (fund_size_amount > 0),   -- 결성액. 결성 전엔 비움
  formation_date            date,
  vintage_year              integer generated always as (extract(year from formation_date)::integer) stored,
  term_years                integer check (term_years > 0),
  investment_period_years   integer check (investment_period_years > 0),
  management_fee_rate       numeric(7,6) check (management_fee_rate between 0 and 1),
  carry_rate                numeric(7,6) check (carry_rate between 0 and 1),
  hurdle_rate               numeric(7,6) check (hurdle_rate between 0 and 1),
  primary_purpose           text,
  primary_purpose_min_ratio numeric(7,6) check (primary_purpose_min_ratio between 0 and 1),
  data_source               text not null check (data_source in ('gp_api', 'manual')),
  gp_fund_id                uuid,                                -- 연동 조합의 GP 쪽 ID
  last_synced_at            timestamptz,
  created_by                uuid,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  unique (org_id, id),
  unique (org_id, gp_fund_id),
  foreign key (org_id, gp_id) references gps(org_id, id),
  foreign key (org_id, created_by) references users(org_id, id),
  constraint gp_fund_id_only_for_gp_api check ((data_source = 'gp_api') = (gp_fund_id is not null)),
  constraint formed_has_formation check (status in ('planning', 'fundraising') or formation_date is not null)
);
comment on table funds is '조합 (출자했거나 검토 중인 조합, 기관마다 따로)';


-- =============================================================================
-- 3. 출자 계획
-- =============================================================================

create table budgets (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id),
  budget_year  integer not null check (budget_year between 2000 and 2100),
  total_amount bigint not null check (total_amount >= 0),
  memo         text,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (org_id, id),
  unique (org_id, budget_year),            -- BR-BUD-01 한 해 한 예산
  foreign key (org_id, created_by) references users(org_id, id)
);
comment on table budgets is '연도별 출자 예산';

create table budget_allocations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id),
  budget_id  uuid not null,
  strategy   text not null check (strategy in ('early', 'growth', 'secondary', 'overseas', 'other')),
  amount     bigint not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (org_id, id),
  unique (budget_id, strategy),
  foreign key (org_id, budget_id) references budgets(org_id, id) on delete cascade
);
comment on table budget_allocations is '예산의 분야별 배분 (합계 ≤ 예산 총액은 서버가 검사, BR-BUD-02)';


-- =============================================================================
-- 4. 출자사업 · 출자 제안 · 심사
-- =============================================================================

create table programs (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id),
  budget_id        uuid not null,
  name             text not null,
  apply_start_date date not null,
  apply_end_date   date not null,
  status           text not null default 'draft' check (status in ('draft', 'open', 'reviewing', 'closed')),
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (org_id, id),
  foreign key (org_id, budget_id) references budgets(org_id, id),
  foreign key (org_id, created_by) references users(org_id, id),
  constraint apply_period_order check (apply_start_date <= apply_end_date)
);
comment on table programs is '출자사업 공고';

create table program_tracks (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references orgs(id),
  program_id           uuid not null,
  name                 text not null,
  strategy             text not null check (strategy in ('early', 'growth', 'secondary', 'overseas', 'other')),
  planned_amount       bigint not null check (planned_amount > 0),
  target_gp_count      integer not null check (target_gp_count > 0),
  min_fund_size_amount bigint check (min_fund_size_amount > 0),
  max_commitment_ratio numeric(7,6) check (max_commitment_ratio > 0 and max_commitment_ratio <= 1),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (org_id, id),
  unique (program_id, name),
  foreign key (org_id, program_id) references programs(org_id, id)
);
comment on table program_tracks is '출자사업 모집 부문';

create table proposals (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references orgs(id),
  gp_id               uuid not null,
  fund_id             uuid not null,
  proposal_channel    text not null check (proposal_channel in ('program', 'direct')),
  program_track_id    uuid,
  requested_amount    bigint not null check (requested_amount > 0),
  received_date       date not null,
  status              text not null default 'received'
                      check (status in ('received', 'screening', 'due_diligence', 'presentation', 'committee',
                                        'selected', 'rejected', 'withdrawn')),
  decided_date        date,
  data_source         text not null check (data_source in ('gp_api', 'manual')),
  gp_proposal_id      uuid,
  gp_response_sent_at timestamptz,          -- GP에 선정·탈락 결과를 전달한 시각 (L5)
  memo                text,                 -- 내부 메모. GP에 보내지 않는다
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (org_id, id),
  unique (org_id, fund_id),                 -- BR-PROP-01 한 조합에 제안 하나
  unique (org_id, gp_proposal_id),
  foreign key (org_id, gp_id) references gps(org_id, id),
  foreign key (org_id, fund_id) references funds(org_id, id),
  foreign key (org_id, program_track_id) references program_tracks(org_id, id),
  foreign key (org_id, created_by) references users(org_id, id),
  constraint track_only_for_program check (proposal_channel = 'program' or program_track_id is null),
  constraint gp_proposal_id_only_for_gp_api check (data_source = 'gp_api' or gp_proposal_id is null),
  constraint decided_has_date check ((status in ('selected', 'rejected', 'withdrawn')) = (decided_date is not null))
);
comment on table proposals is '출자 제안 (조합 × 기관, 🔗 GP lp_proposals의 반대편)';
comment on column proposals.program_track_id is '공고형은 접수 때 부문 지정. 연동 GP 제안은 접수 후 담당자가 붙일 수 있다 (BR-PROP-03)';

create table proposal_stage_history (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id),
  proposal_id uuid not null,
  from_status text,
  to_status   text not null,
  note        text,
  changed_by  uuid,                          -- 동기화·결재 승인으로 바뀐 경우도 결재자를 남긴다
  changed_at  timestamptz not null default now(),

  foreign key (org_id, proposal_id) references proposals(org_id, id),
  foreign key (org_id, changed_by) references users(org_id, id)
);
create index on proposal_stage_history (proposal_id, changed_at);
comment on table proposal_stage_history is '제안 단계 이력 (추가만 가능)';

create trigger proposal_stage_history_no_update before update or delete on proposal_stage_history
  for each row execute function forbid_modification();

create table evaluation_criteria (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id),
  name         text not null,
  weight_ratio numeric(7,6) not null check (weight_ratio > 0 and weight_ratio <= 1),
  sort_order   integer not null default 0,
  retired_at   timestamptz,                  -- 은퇴한 항목. 과거 평가는 남는다
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (org_id, id)
);
create unique index on evaluation_criteria (org_id, name) where retired_at is null;
comment on table evaluation_criteria is '심사 평가 항목 (사용 중 항목 가중치 합계 = 1은 서버가 검사, BR-EVAL-01)';

create table evaluations (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id),
  proposal_id    uuid not null,
  evaluator_id   uuid not null,
  stage          text not null check (stage in ('screening', 'due_diligence', 'presentation', 'committee')),
  evaluated_date date not null,
  opinion        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (org_id, id),
  unique (proposal_id, evaluator_id, stage),   -- BR-EVAL-02 심사위원 × 단계당 하나
  foreign key (org_id, proposal_id) references proposals(org_id, id),
  foreign key (org_id, evaluator_id) references users(org_id, id)
);
comment on table evaluations is '심사 평가표';

create table evaluation_scores (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id),
  evaluation_id  uuid not null,
  criterion_id   uuid not null,
  criterion_name text not null,                -- 평가 당시 값 복사 (03 원칙 6)
  weight_ratio   numeric(7,6) not null check (weight_ratio > 0 and weight_ratio <= 1),
  score          integer not null check (score between 0 and 100),

  unique (evaluation_id, criterion_id),
  foreign key (org_id, evaluation_id) references evaluations(org_id, id) on delete cascade,
  foreign key (org_id, criterion_id) references evaluation_criteria(org_id, id)
);
comment on table evaluation_scores is '평가표의 항목별 점수';

create table selection_terms (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references orgs(id),
  proposal_id          uuid not null,
  budget_id            uuid not null,
  planned_amount       bigint not null check (planned_amount > 0),
  max_commitment_ratio numeric(7,6) check (max_commitment_ratio > 0 and max_commitment_ratio <= 1),
  formation_deadline   date not null,
  key_person_condition text,
  locked_at            timestamptz,             -- 선정 결재 승인 시각. 이후 수정 불가
  created_by           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (org_id, id),
  unique (proposal_id),
  foreign key (org_id, proposal_id) references proposals(org_id, id),
  foreign key (org_id, budget_id) references budgets(org_id, id),
  foreign key (org_id, created_by) references users(org_id, id)
);
comment on table selection_terms is '선정 조건 (결재 승인 후 잠금)';

create function forbid_locked_selection_terms() returns trigger
language plpgsql as $$
begin
  if old.locked_at is not null then
    raise exception '선정 결재가 승인된 선정 조건은 수정·삭제할 수 없습니다.'
      using errcode = 'restrict_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger selection_terms_locked before update or delete on selection_terms
  for each row execute function forbid_locked_selection_terms();


-- =============================================================================
-- 5. 결재 (L4)
-- =============================================================================

create table approvals (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id),
  target_type      text not null check (target_type in ('selection', 'payment', 'vote')),
  target_id        uuid not null,      -- 대상: 제안 / 납입 / 총회. 여러 테이블이라 외래 키 대신 서버가 기관을 검사
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by     uuid not null,
  requested_at     timestamptz not null default now(),
  request_comment  text,
  snapshot         jsonb not null,     -- 기안 시점의 결재 내용 (03 원칙 6)
  approver_id      uuid,
  decided_at       timestamptz,
  decision_comment text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (org_id, id),
  foreign key (org_id, requested_by) references users(org_id, id),
  foreign key (org_id, approver_id) references users(org_id, id),
  constraint no_self_approval check (approver_id is null or approver_id <> requested_by),     -- BR-APR-05
  constraint decided_has_actor check ((status = 'pending') = (decided_at is null and approver_id is null)),
  constraint reject_has_comment check (status <> 'rejected' or coalesce(trim(decision_comment), '') <> '')  -- BR-APR-06
);
create unique index approvals_one_pending on approvals (target_type, target_id) where status = 'pending';  -- BR-APR-02
create index on approvals (org_id, status, requested_at desc);
comment on table approvals is '결재 (선정·납입·투표)';


-- =============================================================================
-- 6. 출자 건 · 우리 장부
-- =============================================================================

create table commitments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id),
  fund_id        uuid not null,
  proposal_id    uuid not null,
  status         text not null default 'awaiting_formation'
                 check (status in ('awaiting_formation', 'active', 'cancelled', 'closed')),
  confirmed_date date,
  cancelled_date date,
  cancel_reason  text,
  closed_date    date,
  final_metrics  jsonb,                 -- 청산 때 고정한 최종 성과 (03 원칙 6)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (org_id, id),
  unique (org_id, fund_id),             -- 한 조합에 출자 건 하나
  unique (proposal_id),
  foreign key (org_id, fund_id) references funds(org_id, id),
  foreign key (org_id, proposal_id) references proposals(org_id, id),
  constraint confirmed_has_date check (status not in ('active', 'closed') or confirmed_date is not null),
  constraint cancelled_has_reason check ((status = 'cancelled') = (cancelled_date is not null and cancel_reason is not null)),
  constraint closed_has_metrics check ((status = 'closed') = (closed_date is not null and final_metrics is not null))
);
comment on table commitments is '출자 건 (기관 × 조합). 약정액은 저장하지 않고 장부에서 계산';

create table ledger_entries (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id),
  commitment_id  uuid not null,
  entry_type     text not null check (entry_type in ('commitment', 'contribution', 'distribution')),
  amount         bigint not null check (amount <> 0),
  entry_date     date not null,
  source_type    text not null check (source_type in ('commitment_confirmation', 'commitment_adjustment', 'payment', 'distribution')),
  source_id      uuid not null,
  reversal_of_id uuid,
  memo           text,
  created_by     uuid,
  created_at     timestamptz not null default now(),

  unique (org_id, id),
  foreign key (org_id, commitment_id) references commitments(org_id, id),
  foreign key (org_id, reversal_of_id) references ledger_entries(org_id, id),
  foreign key (org_id, created_by) references users(org_id, id),
  constraint negative_only_for_reversal check (amount > 0 or reversal_of_id is not null)
);
create unique index ledger_entries_one_reversal on ledger_entries (reversal_of_id) where reversal_of_id is not null;
create index on ledger_entries (commitment_id, entry_type, entry_date);
comment on table ledger_entries is '우리 장부: 약정·납입·분배 (추가만 가능, 🔗 GP ledger_entries와 같은 모양)';

create trigger ledger_entries_no_update before update or delete on ledger_entries
  for each row execute function forbid_modification();
create trigger ledger_entries_no_truncate before truncate on ledger_entries
  for each statement execute function forbid_modification();


-- =============================================================================
-- 7. 캐피탈콜 · 납입
-- =============================================================================

create table capital_calls (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs(id),
  commitment_id     uuid not null,
  call_no           integer not null check (call_no > 0),    -- 🔗 GP 회차 (GP API가 ID 대신 회차를 준다)
  is_initial        boolean not null default false,
  call_date         date not null,
  due_date          date not null,
  call_amount       bigint not null check (call_amount > 0),
  purpose           text,
  data_source       text not null check (data_source in ('gp_api', 'manual')),
  gp_payment_status text check (gp_payment_status in ('pending', 'partial', 'paid', 'overdue')),  -- GP가 본 우리 납입 상태
  cancelled_at      timestamptz,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (org_id, id),
  unique (commitment_id, call_no),
  foreign key (org_id, commitment_id) references commitments(org_id, id),
  foreign key (org_id, created_by) references users(org_id, id),
  constraint due_after_call check (due_date >= call_date)
);
comment on table capital_calls is '캐피탈콜 (우리에게 온 납입 요청)';

create table payments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id),
  capital_call_id uuid not null,
  amount          bigint not null check (amount > 0),
  planned_date    date,
  status          text not null default 'requested'
                  check (status in ('requested', 'approved', 'paid', 'rejected', 'cancelled')),
  paid_date       date,
  bank_reference  text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (org_id, id),
  foreign key (org_id, capital_call_id) references capital_calls(org_id, id),
  foreign key (org_id, created_by) references users(org_id, id),
  constraint paid_has_date check (status <> 'paid' or paid_date is not null)
);
create index on payments (capital_call_id);
comment on table payments is '납입 (결재 → 송금). 한 캐피탈콜에 여러 건 가능 (L9)';


-- =============================================================================
-- 8. GP 원장 사본 · 대사 (L6)
-- =============================================================================

create table gp_ledger_entries (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs(id),
  commitment_id     uuid not null,
  gp_entry_id       uuid not null,          -- GP 원장 행 ID
  entry_type        text not null check (entry_type in ('commitment', 'contribution', 'distribution')),
  amount            bigint not null check (amount <> 0),
  entry_date        date not null,
  gp_source         jsonb not null,         -- GP가 준 원인 정보 그대로 (예: {"type":"capital_call","call_no":2})
  gp_reversal_of_id uuid,
  synced_at         timestamptz not null default now(),

  unique (org_id, gp_entry_id),             -- 같은 GP 행을 두 번 넣지 않는다
  foreign key (org_id, commitment_id) references commitments(org_id, id)
);
create index on gp_ledger_entries (commitment_id, entry_type);
comment on table gp_ledger_entries is 'GP 원장 사본 (받은 그대로, 추가만 가능)';

create trigger gp_ledger_entries_no_update before update or delete on gp_ledger_entries
  for each row execute function forbid_modification();
create trigger gp_ledger_entries_no_truncate before truncate on gp_ledger_entries
  for each statement execute function forbid_modification();

create table reconciliations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id),
  commitment_id   uuid not null,
  entry_type      text not null check (entry_type in ('commitment', 'contribution', 'distribution')),
  checked_at      timestamptz not null default now(),
  our_amount      bigint not null,
  gp_amount       bigint not null,
  recon_status    text not null check (recon_status in ('matched', 'mismatched', 'resolved')),
  resolution_memo text,
  resolved_by     uuid,

  foreign key (org_id, commitment_id) references commitments(org_id, id),
  foreign key (org_id, resolved_by) references users(org_id, id),
  constraint matched_means_equal check ((recon_status = 'matched') = (our_amount = gp_amount)),
  constraint resolved_has_memo check (
    (recon_status = 'resolved') = (resolved_by is not null and coalesce(trim(resolution_memo), '') <> '')
  )
);
create index on reconciliations (commitment_id, entry_type, checked_at desc);
comment on table reconciliations is '대사 이력 (추가만 가능, 가장 최근 행이 현재 상태)';

create trigger reconciliations_no_update before update or delete on reconciliations
  for each row execute function forbid_modification();


-- =============================================================================
-- 9. 사후관리: 보고 · 점검 · 총회 · 통지 · 첨부
-- =============================================================================

create table reports (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id),
  fund_id       uuid not null,
  period_type   text not null check (period_type in ('monthly', 'quarterly', 'semiannual', 'annual')),
  period_start  date not null,
  period_end    date not null,
  is_correction boolean not null default false,
  superseded_at timestamptz,               -- 더 새로운 정정 보고로 대체된 시각
  received_date date,
  gp_comment    text,
  snapshot      jsonb,                     -- GP가 보낸 조합 숫자 그대로 (연동)
  nav_amount    bigint check (nav_amount >= 0),   -- 기준일 현재 우리 몫 평가액
  data_source   text not null check (data_source in ('gp_api', 'manual')),
  gp_report_id  uuid,
  reviewed_at   timestamptz,
  reviewed_by   uuid,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (org_id, id),
  unique (org_id, gp_report_id),
  foreign key (org_id, fund_id) references funds(org_id, id),
  foreign key (org_id, reviewed_by) references users(org_id, id),
  foreign key (org_id, created_by) references users(org_id, id),
  constraint period_order check (period_start <= period_end),
  constraint review_has_actor check ((reviewed_at is null) = (reviewed_by is null))
);
-- 기간당 대체되지 않은 보고는 하나 (정정 보고가 들어오면 이전 보고에 superseded_at, BR-RPT-05)
create unique index reports_one_current on reports (fund_id, period_type, period_end) where superseded_at is null;
comment on table reports is 'GP 보고 (정정 보고 포함)';

create table compliance_checks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id),
  report_id      uuid not null,
  check_type     text not null check (check_type in ('primary_purpose', 'other')),
  required_ratio numeric(7,6) check (required_ratio between 0 and 1),
  actual_ratio   numeric(7,6) check (actual_ratio between 0 and 1),
  result         text not null check (result in ('pass', 'fail')),
  memo           text,
  created_by     uuid,
  created_at     timestamptz not null default now(),

  foreign key (org_id, report_id) references reports(org_id, id),
  foreign key (org_id, created_by) references users(org_id, id)
);
comment on table compliance_checks is '약정 조건 준수 점검 (보고서 숫자 기준)';

create table meetings (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id),
  fund_id        uuid not null,
  meeting_type   text not null check (meeting_type in ('formation', 'regular', 'extraordinary', 'dissolution')),
  meeting_date   date not null,
  location       text,
  status         text not null default 'scheduled' check (status in ('scheduled', 'held', 'cancelled')),
  voting_open    boolean not null default false,   -- 연동: GP 값. 수기: 총회일 전이면 true로 둔다
  data_source    text not null check (data_source in ('gp_api', 'manual')),
  gp_meeting_id  uuid,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (org_id, id),
  unique (org_id, gp_meeting_id),
  foreign key (org_id, fund_id) references funds(org_id, id),
  foreign key (org_id, created_by) references users(org_id, id)
);
comment on table meetings is '조합원 총회 (🔗 GP general_meetings)';

create table agendas (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id),
  meeting_id     uuid not null,
  agenda_no      integer not null check (agenda_no > 0),
  agenda_type    text not null check (agenda_type in ('formation', 'terms_amendment', 'manager_change', 'report_approval', 'dissolution', 'other')),
  title          text not null,
  result         text not null default 'pending' check (result in ('pending', 'passed', 'rejected')),
  review_opinion text,                      -- 내부 검토 의견. GP에 보내지 않는다
  gp_agenda_id   uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (org_id, id),
  unique (meeting_id, agenda_no),
  unique (org_id, gp_agenda_id),
  foreign key (org_id, meeting_id) references meetings(org_id, id)
);
comment on table agendas is '총회 안건';

create table votes (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id),
  agenda_id       uuid not null,
  choice          text not null check (choice in ('for', 'against', 'abstain')),
  submitted_at    timestamptz,             -- GP 제출(또는 서면 제출 기록) 시각. 비어 있으면 보낼 것 (BR-SYNC-11)
  gp_vote_channel text check (gp_vote_channel in ('gp', 'lp_system')),  -- GP에 기록된 경로
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (agenda_id),                      -- 기관당 안건 하나에 한 표 (안건이 이미 기관에 속함)
  foreign key (org_id, agenda_id) references agendas(org_id, id),
  foreign key (org_id, created_by) references users(org_id, id)
);
comment on table votes is '우리 투표 (결재는 총회 단위)';

create table notices (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id),
  fund_id          uuid,                    -- 조합원이 되기 전 출자 제안 통지는 비어 있을 수 있다
  notice_type      text not null check (notice_type in ('proposal', 'capital_call', 'report', 'meeting', 'distribution', 'general')),
  title            text not null,
  body             text,
  sent_at          timestamptz not null,
  acknowledged_at  timestamptz,
  acknowledged_by  uuid,
  gp_ack_sent_at   timestamptz,             -- 확인을 GP에 전달한 시각
  data_source      text not null check (data_source in ('gp_api', 'manual')),
  gp_notice_id     uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (org_id, id),
  unique (org_id, gp_notice_id),
  foreign key (org_id, fund_id) references funds(org_id, id),
  foreign key (org_id, acknowledged_by) references users(org_id, id),
  constraint ack_has_actor check ((acknowledged_at is null) = (acknowledged_by is null))
);
create index on notices (org_id, sent_at desc);
comment on table notices is 'GP에게서 받은 통지';

create table attachments (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id),
  target_type      text not null check (target_type in ('proposal', 'report')),
  target_id        uuid not null,
  file_name        text not null,
  content_type     text not null,
  size_bytes       integer check (size_bytes > 0),
  blob_pathname    text unique,             -- 우리가 올린 파일 (비공개 Blob)
  gp_attachment_id uuid,                    -- 연동 GP 파일은 복사하지 않고 볼 때 GP에서 받아 흘려보낸다
  uploaded_by      uuid,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  deleted_by       uuid,

  foreign key (org_id, uploaded_by) references users(org_id, id),
  foreign key (org_id, deleted_by) references users(org_id, id),
  constraint one_file_source check ((blob_pathname is null) <> (gp_attachment_id is null)),
  constraint delete_has_actor check ((deleted_at is null) = (deleted_by is null))
);
create index on attachments (target_type, target_id) where deleted_at is null;
comment on table attachments is '파일 첨부 (제안서·보고서 PDF)';


-- =============================================================================
-- 10. 분배
-- =============================================================================

create table distributions (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references orgs(id),
  commitment_id            uuid not null,
  distribution_no          integer not null check (distribution_no > 0),   -- 🔗 GP 회차
  is_final                 boolean not null default false,
  distribution_date        date not null,
  amount                   bigint not null check (amount > 0),              -- 우리 몫 합계
  return_of_capital_amount bigint check (return_of_capital_amount >= 0),
  profit_amount            bigint check (profit_amount >= 0),
  gp_components            jsonb,                                            -- GP 워터폴 단계별 금액 그대로
  status                   text not null default 'announced' check (status in ('announced', 'received', 'cancelled')),
  received_date            date,
  data_source              text not null check (data_source in ('gp_api', 'manual')),
  created_by               uuid,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  unique (org_id, id),
  unique (commitment_id, distribution_no),
  foreign key (org_id, commitment_id) references commitments(org_id, id),
  foreign key (org_id, created_by) references users(org_id, id),
  constraint received_has_date check (status <> 'received' or received_date is not null),
  constraint parts_sum_to_amount check (   -- BR-DIST-02
    return_of_capital_amount is null or profit_amount is null
    or return_of_capital_amount + profit_amount = amount
  )
);
comment on table distributions is '분배 (GP가 우리에게 돌려준 돈)';


-- =============================================================================
-- 11. 연동 인박스 · 공통
-- =============================================================================

-- 받은 GP 이벤트. 저장 후 바로 200, 처리는 따로 (L15)
create table inbound_events (
  id               uuid primary key default gen_random_uuid(),
  gp_connection_id uuid not null references gp_connections(id),
  gp_event_id      uuid not null,
  event_type       text not null,
  gp_lp_id         uuid,                    -- 조합 전체 이벤트면 비어 있음
  gp_fund_id       uuid,
  occurred_at      timestamptz not null,    -- GP에서 일어난 시각 (처리 순서의 기준)
  payload          jsonb not null,
  received_via     text not null check (received_via in ('webhook', 'pull')),
  status           text not null default 'received' check (status in ('received', 'processed', 'failed', 'ignored')),
  attempts         integer not null default 0,
  next_attempt_at  timestamptz,             -- 실패 후 다시 처리할 시각 (BR-SYNC-07)
  last_error       text,
  received_at      timestamptz not null default now(),
  processed_at     timestamptz,

  unique (gp_connection_id, gp_event_id)    -- 같은 이벤트를 두 번 저장하지 않는다 (BR-SYNC-03)
);
create index on inbound_events (gp_connection_id, occurred_at, gp_event_id) where status in ('received', 'failed');
comment on table inbound_events is 'GP에게서 받은 이벤트 (인박스)';

create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  org_id      uuid references orgs(id),     -- 로그인 실패·웹훅은 비어 있을 수 있다
  actor_type  text not null check (actor_type in ('user', 'gp_webhook', 'cron', 'system')),
  user_id     uuid references users(id),
  user_name   text,                         -- 기록 당시 이름·역할
  user_role   text,
  method      text not null,
  path        text not null,
  action      text not null,                -- ID를 뺀 주소 모양
  status      integer not null,
  error_code  text,
  detail      jsonb,                        -- GP 호출 대상 등 부가 정보 (요청 본문은 저장하지 않는다)
  ip          text,
  user_agent  text
);
create index on audit_logs (org_id, occurred_at desc);
create index on audit_logs (user_id, occurred_at desc);
comment on table audit_logs is '감사 로그 (추가만 가능, 기관별로만 보인다)';

create trigger audit_logs_no_update before update or delete on audit_logs
  for each row execute function forbid_modification();

-- 돈이 움직이는 요청이 두 번 와도 한 번만 처리한다 (🔗 GP D22). 24시간 후 삭제
create table idempotency_keys (
  key             text not null,
  user_id         uuid not null references users(id),
  org_id          uuid not null references orgs(id),
  endpoint        text not null,
  request_hash    text not null,
  response_status integer not null,
  response_body   jsonb not null,
  created_at      timestamptz not null default now(),

  primary key (key, user_id)
);
comment on table idempotency_keys is 'API 중복 요청 방지';

create table scheduled_jobs (
  name             text primary key,        -- 예: gp_sync
  locked_until     timestamptz not null default now(),
  last_trigger     text check (last_trigger in ('cron', 'manual')),
  last_started_at  timestamptz,
  last_finished_at timestamptz,
  last_result      jsonb,
  last_error       text
);
comment on table scheduled_jobs is '주기 작업 잠금·마지막 실행 (🔗 GP D41)';


-- =============================================================================
-- 12. updated_at 자동 갱신 트리거
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'orgs', 'users', 'gp_connections', 'gps', 'funds', 'budgets', 'budget_allocations',
    'programs', 'program_tracks', 'proposals', 'evaluation_criteria', 'evaluations', 'selection_terms',
    'approvals', 'commitments', 'capital_calls', 'payments', 'reports', 'meetings', 'agendas',
    'votes', 'notices', 'distributions'
  ] loop
    execute format(
      'create trigger %I before update on %I for each row execute function set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;


-- =============================================================================
-- 13. 계산용 뷰 (03 원칙 2: 합계·잔액은 저장하지 않고 원본에서 계산)
-- =============================================================================

-- 캐피탈콜별 우리 납입 상태 (BR-CALL-05)
create view v_capital_call_status as
select
  c.id as capital_call_id,
  c.org_id,
  c.commitment_id,
  c.call_no,
  c.call_amount,
  c.due_date,
  coalesce(p.paid_amount, 0)::bigint    as paid_amount,
  coalesce(p.pending_amount, 0)::bigint as pending_amount,   -- 결재 대기 + 송금 대기
  case
    when c.cancelled_at is not null                  then 'cancelled'
    when coalesce(p.paid_amount, 0) >= c.call_amount then 'paid'
    when current_date > c.due_date                   then 'overdue'
    when coalesce(p.paid_amount, 0) > 0              then 'partial'
    else 'pending'
  end as payment_status
from capital_calls c
left join (
  select capital_call_id,
         sum(amount) filter (where status = 'paid')                     as paid_amount,
         sum(amount) filter (where status in ('requested', 'approved')) as pending_amount
  from payments
  group by capital_call_id
) p on p.capital_call_id = c.id;
comment on view v_capital_call_status is '캐피탈콜별 우리 납입 상태';

-- 출자 건별 약정·요청·납입·분배·평가액·배수 (우리 장부 기준, BR-PERF-02·03)
create view v_commitment_summary as
select
  m.id as commitment_id,
  m.org_id,
  m.fund_id,
  m.status,
  f.gp_id,
  f.strategy,
  f.vintage_year,
  f.data_source,
  coalesce(l.commitment_amount, 0)::bigint   as commitment_amount,
  coalesce(cc.called_amount, 0)::bigint      as called_amount,
  coalesce(l.contribution_amount, 0)::bigint as contribution_amount,
  coalesce(l.distribution_amount, 0)::bigint as distribution_amount,
  (coalesce(l.commitment_amount, 0) - coalesce(cc.called_amount, 0))::bigint as unfunded_amount,
  case when m.status = 'closed' then 0 else r.nav_amount end as nav_amount,
  r.period_end as nav_date,
  round(coalesce(l.distribution_amount, 0)::numeric / nullif(l.contribution_amount, 0), 4) as dpi,
  round(case when m.status = 'closed' then 0 else r.nav_amount end::numeric / nullif(l.contribution_amount, 0), 4) as rvpi,
  round((coalesce(l.distribution_amount, 0) + coalesce(case when m.status = 'closed' then 0 else r.nav_amount end, 0))::numeric
        / nullif(l.contribution_amount, 0), 4) as tvpi
from commitments m
join funds f on f.id = m.fund_id
left join (
  select commitment_id,
         sum(amount) filter (where entry_type = 'commitment')   as commitment_amount,
         sum(amount) filter (where entry_type = 'contribution') as contribution_amount,
         sum(amount) filter (where entry_type = 'distribution') as distribution_amount
  from ledger_entries
  group by commitment_id
) l on l.commitment_id = m.id
left join (
  select commitment_id, sum(call_amount) as called_amount
  from capital_calls
  where cancelled_at is null
  group by commitment_id
) cc on cc.commitment_id = m.id
left join lateral (
  select nav_amount, period_end
  from reports
  where fund_id = m.fund_id and superseded_at is null and nav_amount is not null
  order by period_end desc
  limit 1
) r on true;
comment on view v_commitment_summary is '출자 건별 약정·납입·분배·평가액·배수 (기준일 = 오늘. 기준일 지정 계산은 서버 코드)';

-- 예산 연도 × 분야별 배분액과 사용액 (BR-BUD-03)
-- 사용액 = 선정 결재가 승인된 것 + 결재 대기 중인 것의 출자 예정액. 선정 취소된 출자 건은 뺀다
create view v_budget_usage as
with used as (
  select t.org_id, t.budget_id, f.strategy, sum(t.planned_amount) as used_amount
  from selection_terms t
  join proposals p on p.id = t.proposal_id
  join funds f on f.id = p.fund_id
  left join commitments m on m.proposal_id = p.id
  where (p.status = 'selected' and coalesce(m.status, '') <> 'cancelled')
     or exists (select 1 from approvals a
                where a.target_type = 'selection' and a.target_id = p.id and a.status = 'pending')
  group by t.org_id, t.budget_id, f.strategy
)
select
  b.org_id,
  b.id as budget_id,
  b.budget_year,
  b.total_amount,
  s.strategy,
  coalesce(a.amount, 0)::bigint      as allocated_amount,
  coalesce(u.used_amount, 0)::bigint as used_amount
from budgets b
cross join (values ('early'), ('growth'), ('secondary'), ('overseas'), ('other')) as s(strategy)
left join budget_allocations a on a.budget_id = b.id and a.strategy = s.strategy
left join used u on u.budget_id = b.id and u.strategy = s.strategy;
comment on view v_budget_usage is '예산 연도 × 분야별 배분·사용 (예산 합계는 분야를 더해서)';

-- 출자 건 × 구분별 가장 최근 대사 결과 (BR-REC-04)
create view v_recon_current as
select distinct on (commitment_id, entry_type)
  id as reconciliation_id, org_id, commitment_id, entry_type, checked_at,
  our_amount, gp_amount, recon_status, resolution_memo, resolved_by
from reconciliations
order by commitment_id, entry_type, checked_at desc, id;
comment on view v_recon_current is '출자 건 × 구분별 현재 대사 상태';

-- 출자 건별 날짜별 현금흐름: 납입 −, 분배 + (IRR 계산 입력, BR-PERF-04)
create view v_cashflows as
select
  org_id,
  commitment_id,
  entry_date as flow_date,
  case when entry_type = 'contribution' then -amount else amount end as flow_amount,
  entry_type
from ledger_entries
where entry_type in ('contribution', 'distribution');
comment on view v_cashflows is '출자 건별 현금흐름 (IRR은 서버 코드에서 이 뷰로 계산)';
