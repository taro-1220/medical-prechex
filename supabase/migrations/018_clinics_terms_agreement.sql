-- clinics.terms_version / terms_agreed_at: 医院向け利用規約への同意記録。
-- 既存3医院（テスト）を含め、過去データはnullのまま変更しない。
-- カラムはTaroが追加済み。このマイグレーションはファイル作成のみで、まだ適用していない。
alter table clinics add column if not exists terms_version text;
alter table clinics add column if not exists terms_agreed_at timestamptz;
