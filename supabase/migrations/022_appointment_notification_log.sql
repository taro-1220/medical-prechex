-- 022: 予約への自動送信（前日リマインド等）の送信記録。二重送信防止のための監査ログ。
-- 冪等。既存テーブルには影響しない。
-- ※実DBへの適用は運用者の判断で行う（本ファイルは未適用）。
-- ※未適用の間、アプリ側（cron/appointment-reminders）はこのテーブルへの問い合わせが
--   42P01（relation does not exist）になるため、安全側で「送信済み扱い」にして実送信を行わない
--   （対象件数0として動く。クラッシュしない）。

create table if not exists public.appointment_notification_log (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references public.appointments(id) on delete cascade,
  notification_type text not null,
  sent_at         timestamptz not null default now(),
  constraint appointment_notification_log_unique unique (appointment_id, notification_type)
);

create index if not exists appointment_notification_log_appt_idx
  on public.appointment_notification_log (appointment_id);

-- RLS有効・ポリシー無し + service_roleのみ select/insert。anon/authenticatedは一切触れない。
alter table public.appointment_notification_log enable row level security;
revoke all on table public.appointment_notification_log from public, anon, authenticated;
grant select, insert on table public.appointment_notification_log to service_role;

-- ロールバック: drop table if exists public.appointment_notification_log;
