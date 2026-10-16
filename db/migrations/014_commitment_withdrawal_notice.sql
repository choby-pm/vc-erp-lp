-- =============================================================================
-- 014_commitment_withdrawal_notice.sql — 선정 취소를 GP에 확약 철회로 통보 (W05 잔여, L63)
-- =============================================================================
-- 연동 출자 건을 선정 취소하면 그 제안의 GP 응답을 'withdrawn'(확약 철회)으로 다시 보낸다.
-- 보낼 것 판단은 기존과 같다: gp_response_sent_at 이 비면 보낼 것 (BR-SYNC-11). GP는 통보만 받고 담당자가 확인해야 확약을 바꾼다.
-- 기존 데이터: 이전에 취소된 연동 출자 건은 이미 보낸 상태라 소급해 보내지 않는다.
alter table proposals drop constraint proposals_gp_response_status_check;
alter table proposals add constraint proposals_gp_response_status_check
  check (gp_response_status in ('reviewing', 'committed', 'declined', 'withdrawn'));
comment on column proposals.gp_response_status is 'GP에 마지막으로 전달한 GP 제안 상태 (reviewing / committed / declined / withdrawn=선정 취소 통보)';
