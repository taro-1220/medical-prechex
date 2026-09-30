-- clinics.is_test: テストデータを手動で識別するためのフラグ。
-- 既定はfalse（既存行を誤って「テスト」扱いしない安全側）。
-- このマイグレーションはファイル作成のみで、まだ適用していない。
alter table clinics add column if not exists is_test boolean not null default false;
