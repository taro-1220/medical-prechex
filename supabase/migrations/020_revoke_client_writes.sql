-- 020: anon / authenticated による DB 直接書き込みの撤去（承認制迂回の防止）
--
-- 背景: アプリの DB アクセスは全て service role（getSupabase）経由で、ブラウザの Supabase クライアントは
--       auth.*（ログイン・セッション）にしか使わない。にもかかわらず Supabase 既定で anon / authenticated に
--       public テーブルの全権限が付与されており、clinics_update ポリシー（owner/manager 更新可）と組み合わさると、
--       承認待ち医院の owner が公開 anon key + 自分の JWT で clinics.status を 'active' に書き換えられる。
--
-- 方針: SELECT 権限と SELECT ポリシーは維持。書き込み系の権限とポリシーだけを撤去する。
--       service_role には一切触れない（BYPASSRLS・既存の権限のまま）。auth スキーマにも触れない。
-- 冪等: 何度実行しても同じ結果になる。
-- ※実DBへの適用は運用者の判断で行う（本ファイルは未適用）。適用順: 020 → 019 → 021。

do $$
declare
  r record;
begin
  -- 1. public の全テーブル（将来分・本ファイルに載っていない手動作成テーブルを含む）から、
  --    書き込み系権限を撤去する。テーブル権限の REVOKE は列単位の権限も同時に取り消す。
  for r in
    select c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p')
  loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on table public.%I from public, anon, authenticated',
      r.relname
    );
  end loop;

  -- 2. シーケンスの書き込み系権限（nextval / setval）も撤去する。
  for r in
    select c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'S'
  loop
    execute format('revoke usage, update on sequence public.%I from public, anon, authenticated', r.relname);
  end loop;

  -- 3. 書き込み系の RLS ポリシー（INSERT / UPDATE / DELETE）を撤去する。
  --    権限が撤去済みのため効力はないが、権限が再付与されても書き込めないようにする（多層防御）。
  --    SELECT ポリシーは触らない。
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    raise notice '020: dropped write policy % on %.%', r.policyname, r.schemaname, r.tablename;
  end loop;

  -- 4. cmd = ALL のポリシーは SELECT も含むため自動では削除しない。
  --    書き込み権限は 1. で撤去済みなので書き込みには使えない。内容は運用者が確認すること。
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and cmd = 'ALL'
  loop
    raise notice '020: [manual review] ALL policy % on %.% was kept (writes are revoked)', r.policyname, r.schemaname, r.tablename;
  end loop;
end
$$;

-- 5. 今後 public に作られるテーブル・シーケンスに書き込み権限が自動付与されないようにする。
--    ※ALTER DEFAULT PRIVILEGES は「実行ロールが作成するオブジェクト」にのみ効く。
--      SQL Editor（postgres）以外のロールが作るオブジェクトは、作成時に個別に REVOKE すること。
alter default privileges in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from anon, authenticated;
alter default privileges in schema public
  revoke usage, update on sequences from anon, authenticated;

-- ロールバック（権限を元に戻す。承認制迂回が再び可能になるため通常は使わない）:
--   grant insert, update, delete, truncate, references, trigger on all tables in schema public to anon, authenticated;
--   grant usage, update on all sequences in schema public to anon, authenticated;
--   ※削除したポリシーは 004 / 008 / 010 の create policy を再実行して復元する。
