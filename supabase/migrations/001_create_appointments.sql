create table if not exists appointments (
  id               uuid primary key default gen_random_uuid(),
  token            text unique not null,
  clinic_name      text not null default '',
  patient_name     text not null,
  phone            text not null default '',
  email            text not null default '',
  communication_channel text not null default 'manual',
  appointment_at   timestamptz not null,
  description      text not null default '',
  cancellation_policy text not null default '',
  status           text not null default 'confirmation_pending',
  consent_at       timestamptz,
  checked_in_at    timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- updated_at を自動更新するトリガー
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger appointments_updated_at
  before update on appointments
  for each row execute procedure set_updated_at();
