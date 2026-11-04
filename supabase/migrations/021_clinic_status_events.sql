-- 021: 医院の承認状態変更の監査ログと、監査付きの状態変更関数
--
-- 目的:
--   * 承認・却下・再承認の履歴（実行者・日時・変更前後・理由）を追記専用テーブルに残す。
--   * clinics.status の変更を、必ず public.ops_change_clinic_status() 経由にする。
--     （状態変更と監査記録は同一トランザクション。行ロックで同時実行を直列化し、不正遷移・重複承認を拒否する）
--   * 既存の医院の過去の承認履歴は作らない（履歴不明のまま。バックフィルしない）。
--
-- 許可する遷移（これ以外は 'invalid_transition'）:
--   pending_approval -> active    approve   理由は任意
--   pending_approval -> rejected  reject    理由は必須
--   rejected         -> active    reapprove 理由は必須
--
-- 実行権限: ops_change_clinic_status は service_role のみ。「運営管理者かどうか」の判定は API 層
--   （requireOpsAdmin / OPS_ADMIN_EMAILS）で行い、その結果の実行者情報をこの関数に渡す。
--   DB は OPS_ADMIN_EMAILS を知らないため、service_role の呼び出し元を信頼境界とする。
--
-- 冪等。※実DBへの適用は運用者の判断で行う（本ファイルは未適用）。適用順: 020 → 019 → 021。
-- ※適用後は旧API（clinics.status を直接 update するコード）が 42501 で失敗する。新APIのデプロイとセットで行うこと。

create table if not exists public.clinic_status_events (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete restrict,
  action         text not null,
  from_status    text not null,
  to_status      text not null,
  actor_user_id  uuid not null,   -- auth.users への FK は張らない（ユーザー削除後も履歴を残す）
  actor_email    text not null,
  reason         text,
  created_at     timestamptz not null default now(),
  constraint clinic_status_events_action_check
    check (action in ('approve', 'reject', 'reapprove')),
  constraint clinic_status_events_status_check
    check (from_status in ('active', 'pending_approval', 'rejected')
       and to_status in ('active', 'pending_approval', 'rejected')
       and from_status <> to_status),
  constraint clinic_status_events_reason_check
    check (reason is null or char_length(reason) <= 1000),
  constraint clinic_status_events_reason_required_check
    check (action = 'approve' or (reason is not null and char_length(btrim(reason)) > 0))
);

create index if not exists clinic_status_events_clinic_id_created_at_idx
  on public.clinic_status_events (clinic_id, created_at desc);

-- 追記専用: UPDATE / DELETE / TRUNCATE を所有者を含め全員拒否する。
create or replace function public.clinic_status_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'clinic_status_events is append-only' using errcode = '55000';
end
$$;

drop trigger if exists clinic_status_events_no_update_delete on public.clinic_status_events;
create trigger clinic_status_events_no_update_delete
  before update or delete on public.clinic_status_events
  for each row execute function public.clinic_status_events_append_only();

drop trigger if exists clinic_status_events_no_truncate on public.clinic_status_events;
create trigger clinic_status_events_no_truncate
  before truncate on public.clinic_status_events
  for each statement execute function public.clinic_status_events_append_only();

-- RLS 有効・ポリシーなし + 権限を service_role の SELECT のみに絞る。
-- INSERT は SECURITY DEFINER 関数（テーブル所有者権限）だけが行う＝履歴を直接捏造できない。
alter table public.clinic_status_events enable row level security;
revoke all on table public.clinic_status_events from public, anon, authenticated, service_role;
grant select on table public.clinic_status_events to service_role;

-- clinics.status の変更は ops_change_clinic_status() 内（トランザクションローカルのフラグ ON）でのみ許可する。
-- service_role の直接 UPDATE や、権限・ポリシーの設定ミスによる書き換えも DB 側で拒否する。
create or replace function public.clinics_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and coalesce(pg_catalog.current_setting('medipre.clinic_status_change', true), '') <> 'on' then
    raise exception 'clinics.status can only be changed via public.ops_change_clinic_status'
      using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists clinics_status_guard on public.clinics;
create trigger clinics_status_guard
  before update of status on public.clinics
  for each row execute function public.clinics_status_guard();

-- 監査付きの状態変更。エラーは errcode で区別する（API が HTTP ステータスへ変換する）:
--   P0002 clinic_not_found / 55000 invalid_transition / 22023 invalid_actor|invalid_status|reason_required|reason_too_long
create or replace function public.ops_change_clinic_status(
  p_clinic_id      uuid,
  p_to_status      text,
  p_actor_user_id  uuid,
  p_actor_email    text,
  p_reason         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from     text;
  v_action   text;
  v_email    text := lower(nullif(pg_catalog.btrim(coalesce(p_actor_email, '')), ''));
  v_reason   text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_event_id uuid;
begin
  if p_clinic_id is null or p_actor_user_id is null or v_email is null then
    raise exception 'invalid_actor' using errcode = '22023';
  end if;
  if p_to_status is null or p_to_status not in ('active', 'rejected') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if v_reason is not null and pg_catalog.char_length(v_reason) > 1000 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;

  -- 行ロック: 同一医院への同時実行を直列化する。後続は更新後の状態を見て invalid_transition になる。
  select c.status into v_from from public.clinics c where c.id = p_clinic_id for update;
  if not found then
    raise exception 'clinic_not_found' using errcode = 'P0002';
  end if;

  if v_from = 'pending_approval' and p_to_status = 'active' then
    v_action := 'approve';
  elsif v_from = 'pending_approval' and p_to_status = 'rejected' then
    v_action := 'reject';
  elsif v_from = 'rejected' and p_to_status = 'active' then
    v_action := 'reapprove';
  else
    raise exception 'invalid_transition' using errcode = '55000', detail = v_from || ' -> ' || p_to_status;
  end if;

  if v_action in ('reject', 'reapprove') and v_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  perform pg_catalog.set_config('medipre.clinic_status_change', 'on', true);
  update public.clinics set status = p_to_status where id = p_clinic_id;
  perform pg_catalog.set_config('medipre.clinic_status_change', '', true);

  insert into public.clinic_status_events
    (clinic_id, action, from_status, to_status, actor_user_id, actor_email, reason)
  values
    (p_clinic_id, v_action, v_from, p_to_status, p_actor_user_id, v_email, v_reason)
  returning id into v_event_id;

  return pg_catalog.jsonb_build_object(
    'changed', true,
    'event_id', v_event_id,
    'action', v_action,
    'from_status', v_from,
    'to_status', p_to_status
  );
end
$$;

revoke all on function public.ops_change_clinic_status(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.ops_change_clinic_status(uuid, text, uuid, text, text)
  to service_role;

-- ロールバック（監査ログとガードを外す。履歴が失われるため、履歴テーブルは残して関数とトリガーだけ外すのを推奨）:
--   drop trigger if exists clinics_status_guard on public.clinics;
--   drop function if exists public.ops_change_clinic_status(uuid, text, uuid, text, text);
--   -- 履歴ごと消す場合のみ（追記専用トリガーを先に外す）:
--   -- drop trigger if exists clinic_status_events_no_update_delete on public.clinic_status_events;
--   -- drop trigger if exists clinic_status_events_no_truncate on public.clinic_status_events;
--   -- drop table if exists public.clinic_status_events;
