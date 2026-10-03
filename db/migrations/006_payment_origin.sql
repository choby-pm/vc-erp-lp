-- =============================================================================
-- 006_payment_origin.sql — 가져온 납입 · GP가 본 납입액 (R4, L27)
-- =============================================================================
-- ① payments.origin
--    · approval : 기안 → 결재 → 송금 완료를 거친 보통 납입 (BR-PAY-01~04)
--    · imported : 이 시스템 전에 이미 출자한 연동 조합(가져온 출자 건, L19)의 과거 납입.
--                 GP 원장의 납입 행을 근거로 결재 없이 '송금 완료'로 만든다 (L27). 송금 완료 상태로만 존재한다
--    이미 있는 납입은 없지만, 기본값은 approval
-- ② capital_calls.gp_paid_amount
--    GP가 본 우리 납입액 (🔗 GP my_paid_amount). gp_payment_status 와 함께 "우리는 보냈는데 GP는 미납"을 찾는다. 연동만
-- =============================================================================

alter table payments add column origin text not null default 'approval' check (origin in ('approval', 'imported'));
alter table payments add constraint imported_is_paid check (origin = 'approval' or status = 'paid');
comment on column payments.origin is 'approval: 결재를 거친 납입 / imported: 가져온 출자 건의 과거 납입 (GP 원장 근거, 결재 없음, L27)';

alter table capital_calls add column gp_paid_amount bigint check (gp_paid_amount >= 0);
alter table capital_calls add constraint gp_fields_only_for_gp_api
  check (data_source = 'gp_api' or (gp_payment_status is null and gp_paid_amount is null));
comment on column capital_calls.gp_paid_amount is 'GP가 본 우리 납입액 (🔗 GP my_paid_amount). 연동만';
