-- =============================================================================
-- 009_key_person_tracking.sql — 핵심 운용 인력 변경 감지 (R5-4, L37)
-- =============================================================================
-- 선정 조건에 "핵심 운용 인력 유지"가 있을 수 있다. GP 조합 정보의 운용 인력 중 대표·핵심(lead·key)만 저장해 두고,
-- 동기화 때 바뀌면 key_person_changed_at 을 찍는다 → 주의 목록 "핵심 운용 인력 변경" → 담당자가 확인하면 reviewed
--   · gp_key_persons       : 지금 GP의 대표·핵심 운용 인력 [{ name, position, role }] (연동만)
--   · gp_key_persons_prev  : 바뀌기 직전 목록 (화면에서 무엇이 바뀌었는지 보여준다)
--   · key_person_changed_at / reviewed_at·by : 마지막 변경 시각 / 담당자 확인
-- 처음 받을 때는 변경으로 보지 않는다 (비교할 이전 값이 없다)
-- 수기 조합은 담당자가 기록하는 기능을 고도화로 남긴다
-- =============================================================================

alter table funds add column gp_key_persons          jsonb;
alter table funds add column gp_key_persons_prev     jsonb;
alter table funds add column key_person_changed_at   timestamptz;
alter table funds add column key_person_reviewed_at  timestamptz;
alter table funds add column key_person_reviewed_by  uuid;
alter table funds add constraint funds_key_person_reviewer_fk foreign key (org_id, key_person_reviewed_by) references users(org_id, id);
alter table funds add constraint key_person_review_has_actor check ((key_person_reviewed_at is null) = (key_person_reviewed_by is null));

comment on column funds.gp_key_persons is 'GP 조합 정보의 대표·핵심 운용 인력 [{name, position, role}] (연동, L37)';
comment on column funds.gp_key_persons_prev is '핵심 운용 인력이 바뀌기 직전 목록';
comment on column funds.key_person_changed_at is '핵심 운용 인력이 마지막으로 바뀐 것을 감지한 시각';
comment on column funds.key_person_reviewed_at is '담당자가 핵심 운용 인력 변경을 확인한 시각';
