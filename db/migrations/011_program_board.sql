-- 011: 출자사업 공고 게시판 (R8-1, L50·L51)
-- · 게시판은 LP ERP에 로그인한 모든 기관 사용자와 연동 GP가 본다 — 기관 분리의 예외. 공고 항목만, 읽기 전용
-- · apply_guide: 접수 방법 안내 (연동 안 된 GP가 볼 문구, 예: "제안서는 ○○ 접수 시스템으로")
-- · source / source_url: 공고 출처. R8은 우리 서비스(internal)만. 고도화에서 외부 기관 공고 수집(external)을 붙일 자리 ⚠️

alter table programs
  add column apply_guide text,
  add column source      text not null default 'internal' check (source in ('internal', 'external')),
  add column source_url  text,
  add constraint external_has_url check (source = 'internal' or source_url is not null);

comment on column programs.apply_guide is '접수 방법 안내 (게시판에 보임, L51)';
comment on column programs.source is '공고 출처: internal = 이 서비스의 기관, external = 외부 기관 사이트에서 수집 (고도화, L51)';

-- 게시판에 내보내는 항목만 (예산 · 내부 메모 · 접수 현황은 없음). 접수 중 · 심사 중 공고만
create view v_board_programs as
select p.id, p.org_id, o.name as org_name, p.name, p.apply_start_date, p.apply_end_date, p.status,
       p.apply_guide, p.source, p.source_url, p.updated_at
from programs p
join orgs o on o.id = p.org_id
where p.status in ('open', 'reviewing');

comment on view v_board_programs is '출자사업 공고 게시판 (R8-1, L50). 기관을 가리지 않고 읽는 유일한 뷰 — 공고 항목만';
