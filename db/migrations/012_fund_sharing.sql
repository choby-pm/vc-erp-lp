create table fund_sharing_states (
  org_id uuid not null references orgs(id),
  fund_id uuid not null,
  snapshot jsonb not null,
  checked_at timestamptz not null default clock_timestamp(),
  primary key(org_id,fund_id),
  foreign key(org_id,fund_id) references funds(org_id,id)
);
comment on table fund_sharing_states is 'GP 공유 정책의 최근 확인 캐시. 원본은 GP, 수신 보고와 결재 근거를 삭제하지 않음';
