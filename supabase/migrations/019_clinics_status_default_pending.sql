-- 承認制(Phase P1)の多層防御: clinics.status の default を 'pending_approval' にする。
-- 015 のコメントおよび実DBの確認結果のとおり従来 default は 'active' で、status 未指定の insert が承認を迂回し得た。
-- アプリ側(create/signup)は status を明示して insert するため、本変更で既存フローは変わらない。
-- 既存行は変更しない（default はこれ以降の insert にのみ効く。UPDATE は行わない）。冪等。
-- ※「status='active' を明示した不正 INSERT」は default では防げない。020 の権限撤去
--   （anon / authenticated から clinics への INSERT/UPDATE/DELETE を REVOKE）で拒否する。適用順: 020 → 019 → 021。
-- ※実DBへの適用は運用者の判断で行う（本ファイルは未適用）。
alter table clinics alter column status set default 'pending_approval';
