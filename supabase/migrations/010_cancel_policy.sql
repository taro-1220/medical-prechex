-- MVP+1: 予約チケット化とキャンセルポリシー合意基盤
-- 金額は構造化しない（段階と金額は policy_text 内に医院が自由記述する）。
-- Medipreは推奨金額・推奨料率を一切提示しない。

-- clinic_profile: キャンセル料ポリシー機能の医院単位トップレベル設定
alter table clinic_profile
  add column if not exists cancel_policy_enabled boolean not null default false,
  add column if not exists cancel_policy_scope text check (cancel_policy_scope in ('private', 'insurance', 'both')),
  add column if not exists cancel_policy_insurance_acknowledged boolean not null default false;

-- clinic_cancel_policies: 自由診療／保険診療でそれぞれ独立したポリシー本文を保持する
create table if not exists clinic_cancel_policies (
  id                     uuid primary key default gen_random_uuid(),
  clinic_id              uuid not null references clinics(id) on delete cascade,
  treatment_category     text not null check (treatment_category in ('private', 'insurance')),
  policy_text            text not null default '',
  basis_note             text not null default '',
  show_basis_to_patient  boolean not null default false,
  grace_hours            integer not null default 24,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (clinic_id, treatment_category)
);

create trigger clinic_cancel_policies_updated_at
  before update on clinic_cancel_policies
  for each row execute procedure set_updated_at();

create index if not exists clinic_cancel_policies_clinic_id_idx on clinic_cancel_policies(clinic_id);

-- RLS: 008_message_templates.sql と同型（is_clinic_memberはRLS未設定のclinic_users自己参照を避けるための既存関数を再利用）
alter table clinic_cancel_policies enable row level security;

create policy "clinic_cancel_policies_select" on clinic_cancel_policies for select
  using (public.is_clinic_member(clinic_id));

create policy "clinic_cancel_policies_insert_manager" on clinic_cancel_policies for insert
  with check (
    clinic_id in (
      select clinic_id from clinic_users
      where user_id = auth.uid() and role in ('owner', 'manager')
    )
  );

create policy "clinic_cancel_policies_update_manager" on clinic_cancel_policies for update
  using (
    clinic_id in (
      select clinic_id from clinic_users
      where user_id = auth.uid() and role in ('owner', 'manager')
    )
  );

-- appointments: 予約単位で適用したキャンセル料ポリシーの記録（金額カラムは持たない）
alter table appointments
  add column if not exists treatment_category text not null default 'other' check (treatment_category in ('insurance', 'private', 'other')),
  add column if not exists cancel_policy_applied boolean not null default false,
  add column if not exists cancel_policy_snapshot text,
  add column if not exists cancel_policy_agreed_at timestamptz,
  -- ［キャンセルを申し出る］の記録用（金銭処理は行わない。医院への連絡手段のみ）
  add column if not exists cancel_requested_at timestamptz;

-- consent_logs: 既存構造（policy_text等）は変更せず、適用条件の記録のみ追加する
alter table consent_logs
  add column if not exists treatment_category text,
  add column if not exists policy_scope text;
