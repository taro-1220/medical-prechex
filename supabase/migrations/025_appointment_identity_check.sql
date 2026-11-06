-- 025: 確認URL（/confirm/[token]）の操作前の本人確認における、総当たりロック用の列。
-- 既存行は変更しない（default 0 / null）。冪等。
-- ※実DBへの適用は運用者の判断で行う（本ファイルは未適用）。
-- ※未適用の間、列不存在(42703)を検出し、本人確認自体（氏名・電話番号下4桁の照合）は動くが、
--   失敗回数によるロックは記録できない（安全側に倒せないため、この機能だけ効かない状態になる）。
--   署名付きCookieの発行・検証自体はDBに依存しないため、未適用でも書き込みAPIのCookie検証は機能する。
alter table appointments
  add column if not exists identity_check_fail_count integer not null default 0,
  add column if not exists identity_check_locked_until timestamptz;

-- ロールバック:
--   alter table appointments drop column if exists identity_check_fail_count;
--   alter table appointments drop column if exists identity_check_locked_until;
