-- Phase1: user_id is always null (login not required)
-- Phase2+: populated when patient authenticates (LINE login / email OTP)
alter table patients
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists patients_user_id_idx on patients(user_id);
