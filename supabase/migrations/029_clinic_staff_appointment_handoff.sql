-- 029: 受付（QR読み取り後）に表示する「担当」「備考」「登録者」のための列・テーブル追加。
-- 冪等。既存行は変更しない。
-- ※実DBへの適用は運用者の判断で行う（本ファイルは未適用）。
-- ※未適用の間、アプリ側は列・テーブル不存在(42703/42P01)を検知し、
--   担当・備考・登録者の表示/保存をスキップする（安全側。他の機能は止めない）。

-- ①医院ごとのスタッフ名簿（ログインアカウントを持たない「担当」選択用。clinic_usersとは別）。
-- 物理削除はしない。無効化は active=false のみ
create table if not exists public.clinic_staff_members (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clinic_staff_members_clinic_idx
  on public.clinic_staff_members (clinic_id);

alter table public.clinic_staff_members enable row level security;
revoke all on table public.clinic_staff_members from public, anon, authenticated;
grant select, insert, update on table public.clinic_staff_members to service_role;

-- ②予約への担当・備考・登録者
-- staff_id: 選択中の担当（スタッフ無効化後も予約には残る。表示名はstaff_name_snapshotを使う）
-- staff_name_snapshot: 担当選択時点の氏名（後からスタッフ名を変更・無効化しても変えない）
-- handoff_note: 受付への備考（スタッフ間の引き継ぎ用。キャンセル料根拠のbasis_noteとは別用途）
-- created_by_name: 予約作成者の表示名（Supabase Authのメールアドレスのスナップショット。姓名の仕組みが無いため）
alter table appointments
  add column if not exists staff_id uuid references public.clinic_staff_members(id) on delete set null,
  add column if not exists staff_name_snapshot text,
  add column if not exists handoff_note text,
  add column if not exists created_by_name text;

-- ロールバック:
--   alter table appointments drop column if exists staff_id;
--   alter table appointments drop column if exists staff_name_snapshot;
--   alter table appointments drop column if exists handoff_note;
--   alter table appointments drop column if exists created_by_name;
--   drop table if exists public.clinic_staff_members;

NOTIFY pgrst, 'reload schema';
