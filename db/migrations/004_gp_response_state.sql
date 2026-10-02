-- =============================================================================
-- 004_gp_response_state.sql — 출자 제안 응답을 GP에 보낸 결과 (R3-5, BR-PROP-06, BR-SYNC-11)
-- =============================================================================
-- 보낼 것은 상태로 판단한다 (BR-SYNC-11): 연동 제안의 gp_response_sent_at 이 비어 있고 접수(received)가 아니면 보낼 것.
-- 보낼 GP 상태는 LP 상태에서 정해진다 (심사 중 → reviewing, 선정 → committed, 탈락 → declined).
-- 보낼 GP 상태가 바뀌는 순간 gp_response_sent_at 을 비운다 → 다음 보내기 대상.
--
-- 보내지 못했을 때 화면에 "언제, 왜" 를 보여주려고 마지막 시도 결과를 남긴다.
--   · gp_response_error_code = 'GP_REJECTED' : GP가 업무 규칙으로 거부 (예: GP에서 이미 거절). 다시 보내도 같아서 자동 재시도하지 않는다 ⚠️
--   · 그 밖의 코드(GP_UNAVAILABLE 등)      : 주기 작업·"못 보낸 것 지금 보내기"가 다시 보낸다
-- =============================================================================

alter table proposals add column gp_response_status       text check (gp_response_status in ('reviewing', 'committed', 'declined'));
alter table proposals add column gp_response_attempted_at timestamptz;
alter table proposals add column gp_response_error_code   text;
alter table proposals add column gp_response_error        text;

comment on column proposals.gp_response_sent_at      is 'GP에 지금 상태의 응답(gp_response_status)을 전달한 시각. 비어 있으면 보낼 것 (L5, BR-SYNC-11)';
comment on column proposals.gp_response_status       is 'GP에 마지막으로 전달한 GP 제안 상태 (reviewing / committed / declined)';
comment on column proposals.gp_response_attempted_at is 'GP에 응답을 마지막으로 보내 본 시각 (성공·실패 모두)';
comment on column proposals.gp_response_error_code   is '마지막 시도가 실패한 이유 코드. GP_REJECTED 면 자동 재시도하지 않는다';
comment on column proposals.gp_response_error        is '마지막 시도가 실패한 이유 (화면 경고용)';

alter table proposals add constraint gp_response_only_for_gp_api
  check (data_source = 'gp_api' or (gp_response_sent_at is null and gp_response_status is null and gp_response_attempted_at is null));
