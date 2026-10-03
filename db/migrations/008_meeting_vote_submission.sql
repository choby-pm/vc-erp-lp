-- =============================================================================
-- 008_meeting_vote_submission.sql — 안건 설명 · 투표 제출 결과 (R5-3, BR-VOTE-01~06)
-- =============================================================================
-- ① agendas.description : GP 안건 설명 (찬반을 정하는 근거). 수기 총회는 담당자가 입력
-- ② meetings.vote_submit_* : 승인된 투표를 GP에 제출한 마지막 시도의 결과
--    · 제출에 성공하면 votes.submitted_at 이 찍히고 이 칸은 비운다
--    · GP가 거부(예: 이미 개최 처리돼 투표가 닫힘)하면 GP_REJECTED + 이유 → 주의 목록 "투표 제출 실패" (BR-VOTE-06)
--    · GP에 닿지 못했으면 다른 코드 → 주기 작업·"못 보낸 것 지금 보내기"가 다시 보낸다 (BR-SYNC-11)
-- =============================================================================

alter table agendas add column description text;
comment on column agendas.description is '안건 설명 (연동: GP 값, 수기: 담당자 입력)';

alter table meetings add column vote_submit_attempted_at timestamptz;
alter table meetings add column vote_submit_error_code   text;
alter table meetings add column vote_submit_error        text;
comment on column meetings.vote_submit_attempted_at is '승인된 투표를 GP에 마지막으로 보내 본 시각';
comment on column meetings.vote_submit_error_code   is '마지막 제출이 실패한 이유 코드. GP_REJECTED 면 자동 재시도하지 않는다 (BR-VOTE-06)';
comment on column meetings.vote_submit_error        is '마지막 제출이 실패한 이유 (화면·주의 목록용)';
