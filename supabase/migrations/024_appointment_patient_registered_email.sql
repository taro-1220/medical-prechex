-- 024: 患者が確認画面（/confirm/[token]）から自ら登録する、前日リマインド受取用メールの保存先。
-- 予約単位で保存する（patients.email は上書きしない。患者台帳とは独立した列）。
-- 既存行は変更しない（default null）。冪等。
-- ※実DBへの適用は運用者の判断で行う（本ファイルは未適用)。
-- ※未適用の間、読み取り（select *）は影響しない（列が無いだけ）が、書き込み（この列名を指定した
--   insert/update）は列不存在(42703)になる。アプリ側はこれを検出し、入力欄を表示せず・保存APIは
--   「未対応」を返す安全側で動く。
alter table appointments
  add column if not exists patient_registered_email text,
  add column if not exists patient_registered_email_at timestamptz;

-- ロールバック:
--   alter table appointments drop column if exists patient_registered_email;
--   alter table appointments drop column if exists patient_registered_email_at;
