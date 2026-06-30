-- clinic_profile
create table if not exists clinic_profile (
  id                   uuid primary key default gen_random_uuid(),
  clinic_id            uuid not null unique references clinics(id) on delete cascade,
  clinic_display_name  text not null default '',
  director_name        text not null default '',
  phone                text not null default '',
  email                text not null default '',
  postal_code          text not null default '',
  address              text not null default '',
  website_url          text not null default '',
  cancellation_policy  text not null default '',
  default_message      text not null default '',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger clinic_profile_updated_at
  before update on clinic_profile
  for each row execute procedure set_updated_at();

create index if not exists clinic_profile_clinic_id_idx on clinic_profile(clinic_id);

-- onboarding_progress
create table if not exists onboarding_progress (
  id                      uuid primary key default gen_random_uuid(),
  clinic_id               uuid not null unique references clinics(id) on delete cascade,
  profile_completed       boolean not null default false,
  policy_completed        boolean not null default false,
  notification_completed  boolean not null default false,
  activated_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger onboarding_progress_updated_at
  before update on onboarding_progress
  for each row execute procedure set_updated_at();

create index if not exists onboarding_progress_clinic_id_idx on onboarding_progress(clinic_id);
