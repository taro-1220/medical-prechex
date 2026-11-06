-- 026: 自動送信（前日リマインド・確認URLメール等）の実行結果ログと、予約単位の直近送信失敗記録。
-- 元は「025」として指示されたが、本人確認のロック列(025)と番号が競合するため026に採番した。
-- 冪等。既存行は変更しない。
-- ※実DBへの適用は運用者の判断で行う（本ファイルは未適用）。
-- ※未適用の間、アプリ側は記録の失敗を握りつぶし、送信処理自体は止めない（安全側）。
-- 　/opsの自動送信カードは「記録の準備中」と表示する。

-- ①実行ごとの結果（種類・開始時刻・集計・クリニック単位の内訳）
create table if not exists public.notification_run_log (
  id              uuid primary key default gen_random_uuid(),
  notification_type text not null,
  started_at      timestamptz not null,
  finished_at     timestamptz not null default now(),
  sent_count      integer not null default 0,
  failed_count    integer not null default 0,
  skipped_count   integer not null default 0,
  capped_count    integer not null default 0,
  clinic_breakdown jsonb
);

create index if not exists notification_run_log_type_started_idx
  on public.notification_run_log (notification_type, started_at desc);

alter table public.notification_run_log enable row level security;
revoke all on table public.notification_run_log from public, anon, authenticated;
grant select, insert on table public.notification_run_log to service_role;

-- ②予約単位の直近メール送信失敗時刻（成功時はnullに戻す）
alter table appointments
  add column if not exists email_last_failed_at timestamptz;

-- ロールバック:
--   drop table if exists public.notification_run_log;
--   alter table appointments drop column if exists email_last_failed_at;
