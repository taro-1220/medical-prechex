-- MVP+3: キャンセル発生時の空き枠自動通知＋先着再予約
-- 冪等版（010/011と同じスタイル）: add column if not exists は元々冪等。
-- トリガー・ポリシー・CHECK制約は drop ... if exists → create/add の順にする。
--
-- 設計メモ: キャンセルされたappointments行は患者Aの個人情報を保持したまま残す。
-- 別患者(B)による予約成立は、既存のcreateAppointment()を再利用してappointmentsに
-- 新規行を作ることで表現する。available_slotsは「まだ患者が決まっていない募集単位」のみを表し、
-- 既存appointmentsで表現できる内容（予約そのもの）を重複してモデリングしない。

-- patients: 空き枠通知の受信設定（安全側デフォルトOFF）＋配信停止用トークン
alter table patients
  add column if not exists notify_available_slot boolean not null default false,
  add column if not exists unsubscribe_token text unique not null default gen_random_uuid()::text;

-- clinic_profile: 医院単位の機能ON/OFF（安全側デフォルトOFF）
alter table clinic_profile
  add column if not exists auto_notify_available_slot boolean not null default false;

-- available_slots: キャンセルにより再募集される枠（1キャンセルにつき最大1行。unique制約で二重生成を防ぐ）
create table if not exists available_slots (
  id                          uuid primary key default gen_random_uuid(),
  clinic_id                   uuid not null references clinics(id) on delete cascade,
  source_appointment_id       uuid not null unique references appointments(id) on delete cascade,
  appointment_at              timestamptz not null,
  treatment_category          text not null default 'other',
  description                 text not null default '',
  cancellation_policy         text not null default '',
  base_amount                 integer,
  card_registration_required  boolean not null default false,
  status                      text not null default 'open',
  claimed_by_appointment_id   uuid references appointments(id),
  opened_at                   timestamptz not null default now(),
  closed_at                   timestamptz,
  created_at                  timestamptz not null default now()
);

alter table available_slots drop constraint if exists available_slots_status_check;
alter table available_slots
  add constraint available_slots_status_check
  check (status in ('open', 'booked', 'closed'));

alter table available_slots drop constraint if exists available_slots_treatment_category_check;
alter table available_slots
  add constraint available_slots_treatment_category_check
  check (treatment_category in ('insurance', 'private', 'other'));

create index if not exists available_slots_clinic_id_idx on available_slots(clinic_id);
create index if not exists available_slots_status_idx on available_slots(status);

alter table available_slots enable row level security;

drop policy if exists "available_slots_select" on available_slots;
create policy "available_slots_select" on available_slots for select
  using (public.is_clinic_member(clinic_id));

-- insert/updateはAPI層（service role）のみが行う想定。clinic_users insert/updateポリシーと同じ方針で、
-- クライアントからの直接書き込みポリシーは意図的に作らない（004のTODOと同じ方針）。

-- slot_notifications: 誰に・いつ・どのチャネルで通知したか（監査）＋先着予約URLのトークン（1患者×1枠=1行）
create table if not exists slot_notifications (
  id                          uuid primary key default gen_random_uuid(),
  available_slot_id           uuid not null references available_slots(id) on delete cascade,
  clinic_id                   uuid not null references clinics(id) on delete cascade,
  patient_id                  uuid not null references patients(id) on delete cascade,
  token                       text unique not null,
  channel                     text not null default 'email',
  dry_run                     boolean not null default true,
  sent_at                     timestamptz,
  send_error                  text,
  claimed_at                  timestamptz,
  resulting_appointment_id    uuid references appointments(id),
  created_at                  timestamptz not null default now(),
  unique (available_slot_id, patient_id)
);

alter table slot_notifications drop constraint if exists slot_notifications_channel_check;
alter table slot_notifications
  add constraint slot_notifications_channel_check
  check (channel in ('email', 'sms', 'line'));

create index if not exists slot_notifications_available_slot_id_idx on slot_notifications(available_slot_id);
create index if not exists slot_notifications_clinic_id_idx on slot_notifications(clinic_id);
create index if not exists slot_notifications_patient_id_idx on slot_notifications(patient_id);

alter table slot_notifications enable row level security;

drop policy if exists "slot_notifications_select" on slot_notifications;
create policy "slot_notifications_select" on slot_notifications for select
  using (public.is_clinic_member(clinic_id));
