-- Medipre取り分（application_fee_amount）のDB記録。
-- 冪等版（012と同じスタイル）: add column if not exists は元々冪等。
--
-- 設計メモ: 医院手取り額はamountとapplication_fee_amountから表示側で算出する方針とし、
-- DBへは冗長保存しない（既存constraint通り、amount自体の意味は変更しない）。
alter table charge_events
  add column if not exists application_fee_amount integer;

alter table charge_events drop constraint if exists charge_events_application_fee_amount_check;
alter table charge_events
  add constraint charge_events_application_fee_amount_check
  check (application_fee_amount is null or application_fee_amount >= 0);
