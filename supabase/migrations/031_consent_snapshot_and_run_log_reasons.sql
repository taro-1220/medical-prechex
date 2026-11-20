-- 031: 同意記録に「患者が実際に見た段階表・根拠メモ」を残す。
-- 既存行は更新しない。冪等。
-- ※実DBへの適用は運用者の判断で行う（本ファイルは未適用）。

-- 同意画面に出していた段階表・根拠メモのスナップショット。
-- 表示していなかったものは null のまま（記録と表示を一致させる）。
alter table public.consent_logs
  add column if not exists cancel_policy_tiers_snapshot      jsonb,
  add column if not exists cancel_policy_basis_note_snapshot text;

-- ロールバック:
--   alter table public.consent_logs
--     drop column if exists cancel_policy_tiers_snapshot,
--     drop column if exists cancel_policy_basis_note_snapshot;

NOTIFY pgrst, 'reload schema';
