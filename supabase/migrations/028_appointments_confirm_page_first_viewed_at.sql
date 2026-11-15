-- 028: 確認ページ(/confirm/[token])を最初に開いた日時を記録する列。
-- 同意待ちの進み具合表示（同意待ち一覧の「ページを開いた」）に使う。
-- 冪等。既存行は変更しない（既存予約はnullのまま＝「ページを開いた」は出ない）。
-- ※実DBへの適用は運用者の判断で行う（本ファイルは未適用）。
-- ※未適用の間、アプリ側は列不存在(42703)を検知し、記録をスキップする（安全側。表示は止めない）。

alter table appointments
  add column if not exists confirm_page_first_viewed_at timestamptz;

-- ロールバック: alter table appointments drop column if exists confirm_page_first_viewed_at;

NOTIFY pgrst, 'reload schema';
