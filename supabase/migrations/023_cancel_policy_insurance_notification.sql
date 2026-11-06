-- 023: 保険診療のキャンセル料に、選定療養「予約に基づく診察」の届出確認日時を追加する。
-- 背景(2026-06-01施行・保医発0327第7号): 保険診療のキャンセル料徴収は、選定療養として地方厚生局へ
-- 届出し、予約料を設定し、院内掲示・Web掲載した医療機関に限られる。医院が
-- 「①届出済み ②予約料設定済み ③院内掲示・Web掲載済み」の3項目を確認した時点のみ記録する
-- （3項目を個別には保存しない。未チェックに戻す運用があるため、確認が外れたらこの列をnullに戻す）。
--
-- 既存行は変更しない（default null＝未確認）。冪等。
-- ※実DBへの適用は運用者の判断で行う（本ファイルは未適用）。
-- ※未適用の間、アプリ側は列不存在(42703)を検出し、安全側で「未確認」として動く
--   （＝保険診療のキャンセル料は、適用対象・課金対象にならない）。
alter table clinic_profile
  add column if not exists cancel_policy_insurance_notification_confirmed_at timestamptz;

-- ロールバック: alter table clinic_profile drop column if exists cancel_policy_insurance_notification_confirmed_at;
