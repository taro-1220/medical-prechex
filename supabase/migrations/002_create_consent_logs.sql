create table if not exists consent_logs (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references appointments(id),
  token           text not null unique,
  policy_text     text not null,
  consented_at    timestamptz not null,
  patient_name    text not null,
  appointment_at  timestamptz not null,
  created_at      timestamptz not null default now()
);

-- 参照整合性インデックス
create index if not exists consent_logs_appointment_id_idx on consent_logs(appointment_id);
create index if not exists consent_logs_token_idx on consent_logs(token);
