-- Phase K: charge_eventsに失敗種別を構造化して持たせる（card_declined / system_error）。
-- detailの自由テキストへの文字列規約による区別は採用しない方針（文言変更で静かに壊れるため）。
-- event_typeへの値追加は行わない（'error'は追加しない）。E-3の抽出条件・既存分岐への波及を避け、
-- あくまでevent_type='failure'に対する付加情報として持たせる。
--
-- 実行前提: charge_eventsは0件（実課金開始前）のため移行処理は不要（実行前に件数を再確認済み）。

alter table charge_events
  add column if not exists failure_kind text;

alter table charge_events drop constraint if exists charge_events_failure_kind_check;
alter table charge_events
  add constraint charge_events_failure_kind_check
  check (failure_kind is null or failure_kind in ('card_declined', 'system_error'));

-- event_type='failure'のときのみ値を持つことをDB側でも保証する
alter table charge_events drop constraint if exists charge_events_failure_kind_only_on_failure;
alter table charge_events
  add constraint charge_events_failure_kind_only_on_failure
  check (failure_kind is null or event_type = 'failure');
