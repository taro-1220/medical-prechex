-- 031: 同意記録に「患者が実際に見た段階表・根拠メモ」を残す。
-- 既存行は更新しない。冪等。
-- ※実DBへの適用は運用者の判断で行う（本ファイルは未適用）。

-- 同意画面に出していた段階表・根拠メモのスナップショット。
-- 表示していなかったものは null のまま（記録と表示を一致させる）。
alter table public.consent_logs
  add column if not exists cancel_policy_tiers_snapshot      jsonb,
  add column if not exists cancel_policy_basis_note_snapshot text;

-- 自動送信を止めた理由（医院設定の未完了など）。形式は
-- {"clinic_settings_incomplete": [{"clinic_id": "...", "count": n}]}
alter table public.notification_run_log
  add column if not exists skip_reasons jsonb;

-- ロールバック:
--   alter table public.consent_logs
--     drop column if exists cancel_policy_tiers_snapshot,
--     drop column if exists cancel_policy_basis_note_snapshot;
--   alter table public.notification_run_log
--     drop column if exists skip_reasons;

NOTIFY pgrst, 'reload schema';
