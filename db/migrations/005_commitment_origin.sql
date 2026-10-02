-- =============================================================================
-- 005_commitment_origin.sql — 가져온 출자 건 (R3-6, L19, BR-CMT-01)
-- =============================================================================
-- 출자 건은 선정 결재 승인으로 생긴다(origin = selection). 그런데 연동 GP에는 이 시스템을 쓰기 전에
-- 이미 출자한 조합이 있다 (예: 'LP연동 데모 벤처투자조합'). 이런 조합은 제안 없이 출자 건을 만든다(origin = imported).
--   · selection : 제안이 반드시 있다
--   · imported  : 제안이 없다. 선정 조건이 없으므로 결성 확인표의 기한·비율·예정액 검사는 "해당 없음"
-- 이미 있는 출자 건은 모두 선정 결재로 생긴 것이라 기본값 selection 으로 채운다.
-- =============================================================================

alter table commitments alter column proposal_id drop not null;
alter table commitments add column origin text not null default 'selection' check (origin in ('selection', 'imported'));
alter table commitments add constraint origin_matches_proposal check ((origin = 'selection') = (proposal_id is not null));

comment on column commitments.origin is 'selection: 선정 결재로 생김 / imported: 이 시스템 전에 이미 출자한 연동 조합 (L19)';
comment on column commitments.proposal_id is '어느 제안에서 선정됐는지. 가져온 출자 건은 비움 (L19)';
