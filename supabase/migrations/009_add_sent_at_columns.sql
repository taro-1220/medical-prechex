-- 予約確認URLの手動送信記録（スタッフの「送信しました」申告時刻。送信成否の自動取得はしない）
alter table appointments
  add column if not exists line_sent_at  timestamptz,
  add column if not exists sms_sent_at   timestamptz,
  add column if not exists email_sent_at timestamptz;
