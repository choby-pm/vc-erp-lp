-- =============================================================================
-- 015_gp_call_cancellation.sql — GP가 취소한 캐피탈콜을 담당자가 확인해 반영 (W05 잔여, L64)
-- =============================================================================
-- GP 캐피탈콜 API의 취소 시각·사유를 그대로 받아 둔다 (gp_cancelled_at). 우리 캐피탈콜 취소(cancelled_at)는 담당자가 확인할 때만.
-- 확인 규칙은 수기 취소와 같다: 송금한 납입이 있으면 불가, 결재 대기 납입은 먼저 반려, 송금 대기 납입은 함께 취소 (BR-CALL-04).
-- 기존 데이터: GP 취소가 없으므로 모두 null. 복구: 컬럼 삭제 시 확인 이력이 사라지므로 보존 후 삭제한다.
alter table capital_calls add column gp_cancelled_at timestamptz;
alter table capital_calls add column gp_cancel_reason text;
alter table capital_calls add column cancel_confirmed_by uuid;
alter table capital_calls add constraint gp_cancel_only_for_gp_api check (data_source = 'gp_api' or gp_cancelled_at is null);
comment on column capital_calls.gp_cancelled_at is 'GP가 이 캐피탈콜을 취소한 시각 (GP 값). 우리 취소(cancelled_at)는 담당자 확인 후';
comment on column capital_calls.cancel_confirmed_by is '캐피탈콜을 취소한 우리 사용자 (수기 취소 또는 GP 취소 확인)';
