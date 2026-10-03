-- =============================================================================
-- 007_imported_payment_source.sql — 가져온 납입의 근거 GP 원장 행 (R4-3, L27·L32)
-- =============================================================================
-- 가져온 납입(origin = imported)은 GP 원장의 납입 행 하나를 근거로 만든다.
-- 그 GP 행 ID를 남겨 ① 다시 맞추기를 여러 번 해도 같은 행을 두 번 옮기지 않고 ② 화면에서 근거를 보여준다
-- 보통 납입(approval)은 비운다
-- =============================================================================

alter table payments add column gp_entry_id uuid;
alter table payments add constraint gp_entry_only_for_imported check ((origin = 'imported') = (gp_entry_id is not null));
create unique index payments_one_per_gp_entry on payments (org_id, gp_entry_id) where gp_entry_id is not null;
comment on column payments.gp_entry_id is '가져온 납입의 근거 GP 원장 행 (gp_ledger_entries.gp_entry_id). 보통 납입은 비움 (L32)';
