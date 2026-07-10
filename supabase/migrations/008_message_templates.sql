-- 医院ごとのSMS/LINE/メール送信テンプレート。
-- 未登録時のフォールバック順位はアプリ側で解決する（DB側では素直にNULL可）:
--   1. message_templates に行がある → それを使う
--   2. 無ければ line に限り clinic_profile.default_message を互換フォールバックとして使う
--   3. それも無ければ src/lib/message-templates.ts の DEFAULT_TEMPLATES を使う
create table if not exists message_templates (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  channel     text not null check (channel in ('sms', 'line', 'email')),
  subject     text,
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (clinic_id, channel)
);

create trigger message_templates_updated_at
  before update on message_templates
  for each row execute procedure set_updated_at();

create index if not exists message_templates_clinic_id_idx on message_templates(clinic_id);

-- RLS: 所属医院のみselect、owner/managerのみinsert/update。
-- clinic_users を直接自己参照する再帰ポリシーは作らず、select は
-- 007_fix_clinic_users_select_recursion.sql の public.is_clinic_member() を再利用する
-- （message_templates は clinic_users 自身ではないため、clinic_users への直接subqueryは
--  004_clinic_users_rls.sql の clinics_update と同型で再帰しない）。
alter table message_templates enable row level security;

create policy "message_templates_select" on message_templates for select
  using (public.is_clinic_member(clinic_id));

create policy "message_templates_insert_manager" on message_templates for insert
  with check (
    clinic_id in (
      select clinic_id from clinic_users
      where user_id = auth.uid() and role in ('owner', 'manager')
    )
  );

create policy "message_templates_update_manager" on message_templates for update
  using (
    clinic_id in (
      select clinic_id from clinic_users
      where user_id = auth.uid() and role in ('owner', 'manager')
    )
  );
