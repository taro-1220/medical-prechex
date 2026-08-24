-- MVP+2: キャンセルポリシーに基づく回収（カード登録＋発生時即時課金）
-- 冪等版（010と同じスタイル）: add column if not exists は元々冪等。
-- トリガー・ポリシー・CHECK制約・関数は drop ... if exists → create/add の順にする。
--
-- 絶対制約: オーソリ(manual capture)は使わない。SetupIntent（登録・課金ゼロ）と
-- 発生時のみの即時課金（automatic capture PaymentIntent, off-session）のみ。
-- Stripe Connect direct charge で医院口座へ直接。application_fee は設定しない。
-- 料率・金額の初期値はコード側に一切持たない（tiersは医院が入力する構造のみ定義）。

-- clinic_cancel_policies: 段階テーブル（days_before/no_show × percent）
-- 例: [{"days_before":3,"percent":0},{"days_before":1,"percent":30},
--      {"days_before":0,"percent":50},{"no_show":true,"percent":100}]
alter table clinic_cancel_policies
  add column if not exists tiers jsonb;

create or replace function public.cancel_policy_tiers_valid(tiers jsonb)
returns boolean language sql immutable as $$
  select tiers is null or (
    jsonb_typeof(tiers) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(tiers) t
      where (t->>'percent') is null
         or (t->>'percent')::numeric > 100
         or (t->>'percent')::numeric < 0
    )
  )
$$;

alter table clinic_cancel_policies drop constraint if exists clinic_cancel_policies_tiers_valid;
alter table clinic_cancel_policies
  add constraint clinic_cancel_policies_tiers_valid check (public.cancel_policy_tiers_valid(tiers));

-- clinic_profile: Stripe Connect Express（医院口座への direct charge 用）
alter table clinic_profile
  add column if not exists stripe_account_id text,
  add column if not exists stripe_account_status text not null default 'not_connected';

alter table clinic_profile drop constraint if exists clinic_profile_stripe_account_status_check;
alter table clinic_profile
  add constraint clinic_profile_stripe_account_status_check
  check (stripe_account_status in ('not_connected', 'pending', 'active'));

-- appointments: 予約単位のカード登録・課金状態（金額は医院が入力するbase_amountのみ。
-- 料率テンプレートはコード側に持たない）
alter table appointments
  add column if not exists base_amount integer,
  add column if not exists card_registration_required boolean not null default false,
  add column if not exists stripe_setup_intent_id text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists charge_status text not null default 'none',
  add column if not exists charged_amount integer,
  add column if not exists charge_executed_at timestamptz;

alter table appointments drop constraint if exists appointments_charge_status_check;
alter table appointments
  add constraint appointments_charge_status_check
  check (charge_status in ('none', 'charged', 'failed', 'requires_action', 'written_off'));

alter table appointments drop constraint if exists appointments_base_amount_check;
alter table appointments
  add constraint appointments_base_amount_check
  check (base_amount is null or base_amount >= 0);

-- charge_events: 全操作の証跡（フラグOFF中はdry_run=trueで記録のみ、Stripeは呼ばない）
create table if not exists charge_events (
  id                 uuid primary key default gen_random_uuid(),
  appointment_id     uuid not null references appointments(id) on delete cascade,
  clinic_id          uuid not null references clinics(id) on delete cascade,
  event_type         text not null,
  amount             integer,
  stripe_reference_id text,
  actor              text not null,
  dry_run            boolean not null default true,
  detail             text,
  created_at         timestamptz not null default now()
);

alter table charge_events drop constraint if exists charge_events_event_type_check;
alter table charge_events
  add constraint charge_events_event_type_check
  check (event_type in ('charge', 'failure', 'retry', 'notice'));

alter table charge_events drop constraint if exists charge_events_actor_check;
alter table charge_events
  add constraint charge_events_actor_check
  check (actor in ('system', 'staff'));

create index if not exists charge_events_appointment_id_idx on charge_events(appointment_id);
create index if not exists charge_events_clinic_id_idx on charge_events(clinic_id);

-- RLS: 008/010と同型
alter table charge_events enable row level security;

drop policy if exists "charge_events_select" on charge_events;
create policy "charge_events_select" on charge_events for select
  using (public.is_clinic_member(clinic_id));

-- insert/updateはAPI層（service role）のみが行う想定。クライアントからの直接書き込みは許可しない
-- （clinic_users insert/update ポリシーを意図的に作らない。004のTODOと同じ方針）
