-- 030: 予約への備考を「追記のみ（削除・修正不可）」の記録として保存する。
-- 既存の appointments.handoff_note・staff_id・staff_name_snapshot は変更しない。データ移行もしない。
-- 冪等。
-- ※実DBへの適用は運用者の判断で行う（本ファイルは未適用）。

create table if not exists public.appointment_notes (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references public.appointments(id) on delete restrict,
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  kind            text not null check (kind in ('note', 'staff_change')),
  body            text not null check (char_length(body) >= 1 and char_length(body) <= 500),
  created_by_name text not null,
  created_at      timestamptz not null default now()
);

create index if not exists appointment_notes_appointment_created_idx
  on public.appointment_notes (appointment_id, created_at);

alter table public.appointment_notes enable row level security;
revoke all on table public.appointment_notes from public, anon, authenticated;
grant select, insert on table public.appointment_notes to service_role;

-- 追記のみ: UPDATE/DELETEは例外で拒否する（権限(grant)だけでなくトリガーでも止める）
create or replace function public.appointment_notes_block_update_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'appointment_notes is append-only: % is not allowed', tg_op;
end;
$$;

drop trigger if exists appointment_notes_no_update_delete on public.appointment_notes;
create trigger appointment_notes_no_update_delete
  before update or delete on public.appointment_notes
  for each row execute function public.appointment_notes_block_update_delete();

-- ロールバック:
--   drop trigger if exists appointment_notes_no_update_delete on public.appointment_notes;
--   drop function if exists public.appointment_notes_block_update_delete();
--   drop table if exists public.appointment_notes;

NOTIFY pgrst, 'reload schema';
