-- =============================================================================
-- 010_distribution_receipt.sql — GP가 본 분배 상태 · 수령 경로 (R6-1, L39)
-- =============================================================================
-- ① distributions.gp_status : GP의 분배 상태 (confirmed 확정 · 지급 전 / paid 지급 / cancelled 취소). 연동만
--    "GP 지급됨 · 수령 기록 전"(L39)과 GP 취소(BR-DIST-04)를 판단한다
-- ② distributions.received_via : 수령을 어떻게 기록했나
--    · recorded : 담당자가 통장 입금을 보고 기록 (L39, BR-DIST-03)
--    · imported : 가져온 출자 건의 연결 전 분배 — GP 원장을 근거로 자동 (L27·L32와 같은 방식). 정정할 수 없다
-- =============================================================================

alter table distributions add column gp_status text check (gp_status in ('confirmed', 'paid', 'cancelled'));
alter table distributions add column received_via text check (received_via in ('recorded', 'imported'));
alter table distributions add constraint gp_status_only_for_gp_api check (data_source = 'gp_api' or gp_status is null);
alter table distributions add constraint received_has_via check ((status = 'received') = (received_via is not null) or status = 'cancelled');

comment on column distributions.gp_status is 'GP의 분배 상태 confirmed / paid / cancelled (연동만, L39)';
comment on column distributions.received_via is 'recorded: 담당자 기록 / imported: 가져온 출자 건의 연결 전 분배 (GP 원장 근거)';
