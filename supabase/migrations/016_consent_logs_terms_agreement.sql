-- consent_logs: 既存構造（policy_text等）は変更せず、Medipre利用規約への同意記録のみ追加する
alter table consent_logs
  add column if not exists terms_version text,
  add column if not exists terms_agreed_at timestamptz;
