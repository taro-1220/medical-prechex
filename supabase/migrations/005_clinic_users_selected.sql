alter table clinic_users add column if not exists selected boolean not null default false;

-- 1ユーザーにつき selected=true は最大1件
create unique index if not exists clinic_users_one_selected_per_user
  on clinic_users(user_id) where (selected = true);

-- 既存データ補正: 各ユーザーの最初のclinic_userをselected=trueに
-- selected=trueがすでにいるユーザーはスキップ
update clinic_users
set selected = true
where id in (
  select distinct on (user_id) id
  from clinic_users
  order by user_id, created_at
)
and user_id not in (
  select user_id from clinic_users where selected = true
);
