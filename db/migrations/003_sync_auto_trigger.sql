-- =============================================================================
-- 003_sync_auto_trigger.sql — 받은 이벤트 바로 처리 (R3-4, L15)
-- =============================================================================
-- 웹훅을 받으면 응답을 보낸 뒤 after() 로 바로 처리를 시작한다. 주기 작업(cron)·수동(manual)과 같은 잠금(gp_sync)을 쓰므로
-- 실행 기록의 종류에 auto 를 더한다 (🔗 GP 016 과 같은 방식)
-- =============================================================================

alter table scheduled_jobs drop constraint scheduled_jobs_last_trigger_check;
alter table scheduled_jobs add constraint scheduled_jobs_last_trigger_check check (last_trigger in ('cron', 'manual', 'auto'));
