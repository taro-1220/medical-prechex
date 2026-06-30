-- clinics: spec追加カラム（003では未定義）
alter table clinics add column if not exists slug    text unique;
alter table clinics add column if not exists status  text not null default 'active';

-- clinic_users
create table if not exists clinic_users (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'owner',
  created_at timestamptz not null default now(),
  unique(clinic_id, user_id)
);

create index if not exists clinic_users_clinic_id_idx on clinic_users(clinic_id);
create index if not exists clinic_users_user_id_idx  on clinic_users(user_id);

-- RLS: clinics
alter table clinics enable row level security;

create policy "clinics_select" on clinics for select
  using (id in (select clinic_id from clinic_users where user_id = auth.uid()));

create policy "clinics_insert" on clinics for insert
  with check (auth.uid() is not null);

create policy "clinics_update" on clinics for update
  using (id in (
    select clinic_id from clinic_users
    where user_id = auth.uid() and role in ('owner', 'manager')
  ));

-- RLS: clinic_users
alter table clinic_users enable row level security;

create policy "clinic_users_select" on clinic_users for select
  using (clinic_id in (select clinic_id from clinic_users where user_id = auth.uid()));

-- TODO: 初回クリニック作成時は service role 経由（/api/clinic/create）のみ許可。
--       anon client から clinic_users に直接 insert は意図的にブロック。
create policy "clinic_users_insert_owner" on clinic_users for insert
  with check (
    clinic_id in (
      select clinic_id from clinic_users
      where user_id = auth.uid() and role = 'owner'
    )
  );

create policy "clinic_users_update_owner" on clinic_users for update
  using (clinic_id in (
    select clinic_id from clinic_users
    where user_id = auth.uid() and role = 'owner'
  ));

create policy "clinic_users_delete_owner" on clinic_users for delete
  using (clinic_id in (
    select clinic_id from clinic_users
    where user_id = auth.uid() and role = 'owner'
  ));
