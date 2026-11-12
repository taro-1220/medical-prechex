-- 027: 予約「内容」の選択肢をクリニックごとに保存する（clinic_profile拡張）。
-- 未設定(null)の場合は、コード側の初期選択肢（初診／再診（治療の続き）／定期検診・クリーニング／相談）を使う。
-- 冪等。既存行は変更しない。
-- ※実DBへの適用は運用者の判断で行う（本ファイルは未適用）。
-- ※未適用の間、アプリ側は列不存在(42703)を検知し、初期選択肢にフォールバックする（安全側）。
-- CHECK制約は設けない（jsonb_array_elements等のvolatility・ローカルでの検証可否が未確認のため）。
-- 値の検証（配列・各要素1〜20文字の文字列）はAPI側(addAppointmentDescriptionOption)で行う。

alter table clinic_profile
  add column if not exists appointment_description_options jsonb;

-- ロールバック: alter table clinic_profile drop column if exists appointment_description_options;

NOTIFY pgrst, 'reload schema';
