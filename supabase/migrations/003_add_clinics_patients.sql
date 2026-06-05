-- clinics
create table if not exists clinics (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null default '',
  email      text not null default '',
  address    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clinics_updated_at
  before update on clinics
  for each row execute procedure set_updated_at();

-- patients
create table if not exists patients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null default '',
  email      text not null default '',
  clinic_id  uuid references clinics(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger patients_updated_at
  before update on patients
  for each row execute procedure set_updated_at();

create index if not exists patients_clinic_id_idx on patients(clinic_id);

-- appointments: nullable FK columns (既存行・既存カラムを破壊しない)
alter table appointments
  add column if not exists clinic_id  uuid references clinics(id),
  add column if not exists patient_id uuid references patients(id);

create index if not exists appointments_clinic_id_idx  on appointments(clinic_id);
create index if not exists appointments_patient_id_idx on appointments(patient_id);
