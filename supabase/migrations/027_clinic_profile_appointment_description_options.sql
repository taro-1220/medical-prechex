-- 027: 予約「内容」の選択肢をクリニックごとに保存する（clinic_profile拡張）。
-- 未設定(null)の場合は、コード側の初期選択肢（初診／再診（治療の続き）／定期検診・クリーニング／相談）を使う。
-- 冪等。既存行は変更しない。
-- ※実DBへの適用は運用者の判断で行う（本ファイルは未適用）。
-- ※未適用の間、アプリ側は列不存在(42703)を検知し、初期選択肢にフォールバックする（安全側）。

alter table clinic_profile
  add column if not exists appointment_description_options jsonb;

create or replace function public.appointment_description_options_valid(options jsonb)
returns boolean language sql immutable as $$
  select options is null or (
    jsonb_typeof(options) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(options) o
      where jsonb_typeof(o) != 'string'
         or length(o #>> '{}') < 1
         or length(o #>> '{}') > 20
    )
  )
$$;

alter table clinic_profile drop constraint if exists clinic_profile_appointment_description_options_valid;
alter table clinic_profile
  add constraint clinic_profile_appointment_description_options_valid
  check (public.appointment_description_options_valid(appointment_description_options));

-- ロールバック:
--   alter table clinic_profile drop constraint if exists clinic_profile_appointment_description_options_valid;
--   drop function if exists public.appointment_description_options_valid(jsonb);
--   alter table clinic_profile drop column if exists appointment_description_options;

NOTIFY pgrst, 'reload schema';
