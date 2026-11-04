/* eslint-disable */
// migration 019 / 020 / 021 のローカル検証（メモリ上の Postgres = PGlite。実DB・本番には一切接続しない）。
//
// 実行: NODE_PATH=<@electric-sql/pglite を入れた node_modules> node supabase/tests/verify-020-021.cjs
//   （リポジトリの依存には追加していない。使い捨てディレクトリに `npm i @electric-sql/pglite` して使う）
//
// 流れ: Supabase 相当のロール・既定権限を再現 → 001〜018 を適用 → 本番相当のデータ(3医院・全て active)を投入
//       → 適用前の脆弱性を再現 → 020 → 019 → 021 を適用 → 拒否・許可・遷移・既存データ不変を検証。
// 限界: 単一接続のため「真の同時実行」は検証できない（行ロック `for update` の静的確認のみ）。

const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");

const MIG = path.join(__dirname, "..", "migrations");
const read = (f) => fs.readFileSync(path.join(MIG, f), "utf8");

const U = {
  owner1: "00000000-0000-0000-0000-0000000000a1",
  owner2: "00000000-0000-0000-0000-0000000000a2",
  owner3: "00000000-0000-0000-0000-0000000000a3",
  pendingOwner: "00000000-0000-0000-0000-0000000000b1",
  ops: "00000000-0000-0000-0000-0000000000c1",
  stranger: "00000000-0000-0000-0000-0000000000d1",
};
const C = {
  c1: "10000000-0000-0000-0000-000000000001",
  c2: "10000000-0000-0000-0000-000000000002",
  c3: "10000000-0000-0000-0000-000000000003",
  pending: "10000000-0000-0000-0000-0000000000b1",
};

let pass = 0, fail = 0;
const lines = [];
function check(name, ok, detail = "") {
  if (ok) pass++; else fail++;
  lines.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + detail + "]" : ""}`);
}

async function main() {
  const db = new PGlite();

  // ── Supabase 相当の土台 ───────────────────────────────────────────────
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    -- Supabase の既定: public の新規オブジェクトに anon / authenticated / service_role の全権限
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);

  // ── 001〜018 を順に適用（本番と同じ辞書順） ─────────────────────────────
  const files = fs.readdirSync(MIG).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
  const base = files.filter((f) => Number(f.slice(0, 3)) <= 18);
  for (const f of base) {
    try { await db.exec(read(f)); }
    catch (e) { console.error(`migration ${f} failed: ${e.message}`); throw e; }
  }
  // 本番で手動有効化されている RLS を再現（migration には無い）
  await db.exec(`
    alter table appointments enable row level security;
    alter table patients enable row level security;
    alter table consent_logs enable row level security;
    alter table clinic_profile enable row level security;
    alter table onboarding_progress enable row level security;
    -- 列単位の権限だけが付いたテーブル（020 で消えることの検証用）
    create table zz_colgrant_test (id uuid primary key default gen_random_uuid(), v text);
    revoke all on zz_colgrant_test from anon, authenticated;
    grant select on zz_colgrant_test to authenticated;
    grant update (v), insert (v) on zz_colgrant_test to authenticated;
  `);

  // ── 本番相当データ: 既存3医院(全て active)・owner 3 名、承認待ち 1 医院 ──────────
  await db.exec(`
    insert into auth.users (id, email) values
      ('${U.owner1}','o1@example.test'),('${U.owner2}','o2@example.test'),('${U.owner3}','o3@example.test'),
      ('${U.pendingOwner}','p@example.test'),('${U.ops}','ops@example.test'),('${U.stranger}','s@example.test');
    insert into clinics (id, name) values
      ('${C.c1}','c1'),('${C.c2}','c2'),('${C.c3}','c3');          -- status 省略 = 実DBの default 'active'
    insert into clinics (id, name, status) values ('${C.pending}','pend','pending_approval');
    insert into clinic_users (clinic_id, user_id, role) values
      ('${C.c1}','${U.owner1}','owner'),('${C.c2}','${U.owner2}','owner'),('${C.c3}','${U.owner3}','owner'),
      ('${C.pending}','${U.pendingOwner}','owner');
  `);

  // ── ヘルパー: ロールを切り替えて実行し、結果/エラーを返す ───────────────────────
  async function as(role, sub, sql) {
    await db.exec("begin");
    try {
      if (role !== "postgres") await db.exec(`set local role ${role}`);
      if (sub) await db.query("select set_config('request.jwt.claim.sub', $1, true)", [sub]);
      const res = await db.query(sql);
      await db.exec("rollback");
      return { ok: true, rows: res.rows, affected: res.affectedRows };
    } catch (e) {
      await db.exec("rollback").catch(() => {});
      return { ok: false, code: e.code, msg: e.message };
    }
  }
  // 状態を残したい実行（service_role の正規フロー）
  async function commit(role, sub, sql, params = []) {
    await db.exec("begin");
    try {
      if (role !== "postgres") await db.exec(`set local role ${role}`);
      if (sub) await db.query("select set_config('request.jwt.claim.sub', $1, true)", [sub]);
      const res = await db.query(sql, params);
      await db.exec("commit");
      return { ok: true, rows: res.rows };
    } catch (e) {
      await db.exec("rollback").catch(() => {});
      return { ok: false, code: e.code, msg: e.message };
    }
  }
  // ロールで実行 → ロールを戻して検証SQLを実行(RETURNING は SELECT ポリシーが掛かるため、書き込み成否はここで確認する)
  async function asThen(role, sub, sql, verifySql) {
    await db.exec("begin");
    try {
      await db.exec(`set local role ${role}`);
      if (sub) await db.query("select set_config('request.jwt.claim.sub', $1, true)", [sub]);
      await db.query(sql);
      await db.exec("reset role");
      const v = await db.query(verifySql);
      await db.exec("rollback");
      return { ok: true, rows: v.rows };
    } catch (e) {
      await db.exec("rollback").catch(() => {});
      return { ok: false, code: e.code, msg: e.message };
    }
  }
  const denied = (r) => !r.ok && (r.code === "42501" || /permission denied|row-level security/i.test(r.msg || ""));
  const changedNothing = (r) => r.ok && (r.affected === 0 || (r.rows && r.rows.length === 0));

  // ── 適用前: 脆弱性の再現(ベースライン) ─────────────────────────────────────
  lines.push("== BEFORE (020/019/021 未適用: 現状の本番相当) ==");
  const b1 = await as("authenticated", U.pendingOwner,
    `update clinics set status='active' where id='${C.pending}' returning status`);
  check("[before] 承認待ち医院の owner が自院 status を active に書き換えられる(脆弱性の再現)",
    b1.ok && b1.rows.length === 1 && b1.rows[0].status === "active", b1.ok ? "更新成功=脆弱" : b1.msg);
  const b2 = await asThen("authenticated", U.stranger,
    `insert into clinics (name, status) values ('evil','active')`, `select status from clinics where name='evil'`);
  check("[before] 任意のログインユーザーが status='active' の医院を INSERT できる(脆弱性の再現)",
    b2.ok && b2.rows.length === 1 && b2.rows[0].status === "active", b2.ok ? "INSERT成功=脆弱(孤立した active 医院)" : b2.msg);
  const b3 = await asThen("authenticated", U.stranger,
    `insert into clinics (name) values ('evil2')`, `select status from clinics where name='evil2'`);
  check("[before] status 省略 INSERT は default 'active' になる(実DBの現状)",
    b3.ok && b3.rows.length === 1 && b3.rows[0].status === "active", b3.ok ? b3.rows[0].status : b3.msg);

  // 適用前の SELECT 基準値
  const sel0 = await as("authenticated", U.owner1, `select id from clinics`);

  // ── 020 → 019 → 021 を適用 ──────────────────────────────────────────────
  for (const f of ["020_revoke_client_writes.sql", "019_clinics_status_default_pending.sql", "021_clinic_status_events.sql"]) {
    await db.exec(read(f));
  }
  // 冪等性: もう一度適用してもエラーにならない
  let idem = true, idemMsg = "";
  try { for (const f of ["020_revoke_client_writes.sql", "019_clinics_status_default_pending.sql", "021_clinic_status_events.sql"]) await db.exec(read(f)); }
  catch (e) { idem = false; idemMsg = e.message; }
  check("020/019/021 は2回適用してもエラーにならない(冪等)", idem, idemMsg);

  lines.push("== AFTER (020 → 019 → 021 適用後) ==");

  // 1. 権限: anon / authenticated に SELECT 以外の権限が public テーブルに残らない
  const grants = await db.query(`
    select grantee, table_name, privilege_type from information_schema.role_table_grants
    where table_schema='public' and grantee in ('anon','authenticated','PUBLIC') and privilege_type <> 'SELECT'`);
  check("anon/authenticated/PUBLIC に SELECT 以外のテーブル権限が1件も残らない(全publicテーブル)",
    grants.rows.length === 0, grants.rows.slice(0, 3).map((r) => `${r.grantee}:${r.table_name}:${r.privilege_type}`).join(","));
  const colg = await db.query(`
    select grantee, table_name, column_name, privilege_type from information_schema.column_privileges
    where table_schema='public' and grantee in ('anon','authenticated') and privilege_type <> 'SELECT'`);
  check("列単位の INSERT/UPDATE 権限も残らない(zz_colgrant_test 含む)", colg.rows.length === 0,
    colg.rows.slice(0, 3).map((r) => `${r.table_name}.${r.column_name}`).join(","));
  const seq = await db.query(`
    select c.relname from pg_class c, lateral (select 1) x
    where c.relnamespace='public'::regnamespace and c.relkind='S'
      and (has_sequence_privilege('authenticated', c.oid, 'USAGE') or has_sequence_privilege('anon', c.oid, 'USAGE'))`);
  check("シーケンスの USAGE/UPDATE が anon/authenticated に残らない", seq.rows.length === 0);

  // 2. 直接書き込みの拒否(クライアント想定)
  const owner = U.pendingOwner;
  const attempts = [
    ["owner が自院 status を active に UPDATE", "authenticated", owner, `update clinics set status='active' where id='${C.pending}'`],
    ["owner が自院 name を UPDATE", "authenticated", owner, `update clinics set name='x' where id='${C.pending}'`],
    ["status='active' 明示の clinics INSERT", "authenticated", U.stranger, `insert into clinics (name, status) values ('evil','active')`],
    ["status 省略の clinics INSERT", "authenticated", U.stranger, `insert into clinics (name) values ('evil')`],
    ["clinics DELETE", "authenticated", owner, `delete from clinics where id='${C.pending}'`],
    ["clinic_users INSERT(自分を他院 owner に)", "authenticated", U.stranger, `insert into clinic_users (clinic_id,user_id,role) values ('${C.c1}','${U.stranger}','owner')`],
    ["clinic_users UPDATE(role 昇格)", "authenticated", owner, `update clinic_users set role='owner' where clinic_id='${C.pending}'`],
    ["clinic_users DELETE", "authenticated", owner, `delete from clinic_users where clinic_id='${C.pending}'`],
    ["message_templates INSERT", "authenticated", owner, `insert into message_templates (clinic_id, channel, body) values ('${C.pending}','sms','x')`],
    ["clinic_cancel_policies INSERT", "authenticated", owner, `insert into clinic_cancel_policies (clinic_id) values ('${C.pending}')`],
    ["appointments UPDATE", "authenticated", owner, `update appointments set status='confirmed'`],
    ["patients DELETE", "authenticated", owner, `delete from patients`],
    ["consent_logs INSERT", "authenticated", owner, `insert into consent_logs (appointment_id,token,policy_text,consented_at,patient_name,appointment_at) values (gen_random_uuid(),'t','p',now(),'n',now())`],
    ["clinic_profile UPDATE", "authenticated", owner, `update clinic_profile set stripe_account_status='active'`],
    ["charge_events INSERT", "authenticated", owner, `insert into charge_events (appointment_id,clinic_id,event_type,actor) values (gen_random_uuid(),'${C.pending}','charge','staff')`],
    ["zz_colgrant_test 列単位 UPDATE", "authenticated", owner, `update zz_colgrant_test set v='x'`],
    ["anon が clinics を UPDATE", "anon", null, `update clinics set status='active'`],
    ["anon が clinics を INSERT", "anon", null, `insert into clinics (name,status) values ('a','active')`],
    ["anon が clinic_users を DELETE", "anon", null, `delete from clinic_users`],
    ["authenticated が clinics を TRUNCATE", "authenticated", owner, `truncate clinics cascade`],
  ];
  for (const [name, role, sub, sql] of attempts) {
    const r = await as(role, sub, sql);
    check(`[拒否] ${name}`, denied(r), r.ok ? `許可されてしまった(affected=${r.affected})` : r.code);
  }

  // 3. SELECT / 既存機能への影響
  const sel1 = await as("authenticated", U.owner1, `select id from clinics`);
  check("[維持] authenticated の clinics SELECT は所属医院のみ(適用前と同じ結果)",
    sel1.ok && sel1.rows.length === 1 && sel1.rows[0].id === C.c1 && JSON.stringify(sel0.rows) === JSON.stringify(sel1.rows),
    sel1.ok ? `${sel1.rows.length}件` : sel1.msg);
  const sel2 = await as("authenticated", U.owner1, `select count(*)::int n from clinic_users`);
  check("[維持] authenticated の clinic_users SELECT(is_clinic_member 経由)が動く", sel2.ok && sel2.rows[0].n === 1,
    sel2.ok ? `n=${sel2.rows[0].n}` : sel2.msg);
  const sel3 = await as("authenticated", U.owner1, `select count(*)::int n from appointments`);
  check("[維持] RLS有効・ポリシー無しの appointments は authenticated に0行(エラーなし)", sel3.ok && sel3.rows[0].n === 0);
  const authOk = await as("authenticated", U.owner1, `select auth.uid() u`);
  check("[維持] auth.uid() が authenticated から使える(認証機能)", authOk.ok && authOk.rows[0].u === U.owner1);
  const anonSel = await as("anon", null, `select count(*)::int n from clinics`);
  check("[維持] anon の clinics SELECT はエラーにならず0行", anonSel.ok && anonSel.rows[0].n === 0);

  // 4. service_role による既存API処理(署名登録・医院作成・各種書き込み)が維持される
  const sr = [
    ["signup: clinics INSERT (pending_approval)", `insert into clinics (id,name,status) values ('10000000-0000-0000-0000-0000000000e1','new','pending_approval') returning status`],
    ["clinic_users INSERT", `insert into clinic_users (clinic_id,user_id,role) values ('${C.c2}','${U.owner1}','manager')`],
    ["clinic_profile UPSERT", `insert into clinic_profile (clinic_id, clinic_display_name) values ('${C.c1}','x') on conflict (clinic_id) do update set clinic_display_name='y'`],
    ["clinics の status 以外の UPDATE(name)", `update clinics set name='renamed' where id='${C.c1}' returning name`],
    ["message_templates UPSERT", `insert into message_templates (clinic_id, channel, body) values ('${C.c1}','sms','b') on conflict (clinic_id, channel) do update set body='b2'`],
    ["appointments SELECT", `select count(*) from appointments`],
  ];
  for (const [name, sql] of sr) {
    const r = await as("service_role", null, sql);
    check(`[service_role 維持] ${name}`, r.ok, r.ok ? "" : r.msg);
  }
  const srIns = await as("service_role", null, `insert into clinics (name) values ('d') returning status`);
  check("[019] status 省略 INSERT の default が pending_approval になった", srIns.ok && srIns.rows[0].status === "pending_approval",
    srIns.ok ? srIns.rows[0].status : srIns.msg);

  // 5. status 直接変更のガード(DB側)
  const direct = await as("service_role", null, `update clinics set status='active' where id='${C.pending}'`);
  check("[ガード] service_role でも clinics.status の直接 UPDATE は拒否される(42501)", denied(direct), direct.ok ? "許可された" : direct.code);
  const directPg = await as("postgres", null, `update clinics set status='active' where id='${C.pending}'`);
  check("[ガード] DB 管理者(postgres)の直接 UPDATE も拒否される(関数経由のみ)", denied(directPg), directPg.ok ? "許可された" : directPg.code);

  // 6. 関数の実行権限
  const fx = `select public.ops_change_clinic_status('${C.pending}','active','${U.ops}','OPS@example.test','ok')`;
  for (const [role, sub] of [["anon", null], ["authenticated", U.pendingOwner], ["authenticated", U.ops]]) {
    const r = await as(role, sub, fx);
    check(`[EXECUTE] ${role} は ops_change_clinic_status を実行できない`, denied(r), r.ok ? "実行できてしまった" : r.code);
  }
  const fp = await db.query(`
    select p.prosecdef, p.proconfig, has_function_privilege('service_role', p.oid, 'EXECUTE') sr,
           has_function_privilege('anon', p.oid, 'EXECUTE') an, has_function_privilege('authenticated', p.oid, 'EXECUTE') au
    from pg_proc p where p.proname='ops_change_clinic_status'`);
  check("関数は SECURITY DEFINER・search_path 固定・service_role のみ EXECUTE",
    fp.rows[0].prosecdef === true && JSON.stringify(fp.rows[0].proconfig).includes("search_path=") && fp.rows[0].sr && !fp.rows[0].an && !fp.rows[0].au,
    JSON.stringify(fp.rows[0]));

  // 7. 監査テーブルの保護
  for (const [role, sub, sql, label] of [
    ["authenticated", U.ops, `select * from clinic_status_events`, "authenticated SELECT"],
    ["anon", null, `select * from clinic_status_events`, "anon SELECT"],
    ["authenticated", U.ops, `insert into clinic_status_events (clinic_id,action,from_status,to_status,actor_user_id,actor_email) values ('${C.c1}','approve','pending_approval','active','${U.ops}','x@y')`, "authenticated INSERT"],
    ["service_role", null, `insert into clinic_status_events (clinic_id,action,from_status,to_status,actor_user_id,actor_email) values ('${C.c1}','approve','pending_approval','active','${U.ops}','x@y')`, "service_role 直接 INSERT(履歴の捏造)"],
    ["service_role", null, `update clinic_status_events set reason='x'`, "service_role UPDATE"],
    ["service_role", null, `delete from clinic_status_events`, "service_role DELETE"],
  ]) {
    const r = await as(role, sub, sql);
    check(`[監査テーブル] ${label} は拒否`, denied(r), r.ok ? "許可された" : r.code);
  }

  // 8. 正規の承認フロー(service_role が関数を呼ぶ)
  const call = (clinic, to, reason, email = "Ops@Example.test") =>
    commit("service_role", null, `select public.ops_change_clinic_status($1::uuid,$2,$3::uuid,$4,$5) r`, [clinic, to, U.ops, email, reason]);

  const ap = await call(C.pending, "active", null);
  const r = ap.ok ? ap.rows[0].r : null;
  check("[承認] pending_approval → active が成功し action=approve・変更前後が返る",
    ap.ok && r.changed === true && r.action === "approve" && r.from_status === "pending_approval" && r.to_status === "active", ap.ok ? JSON.stringify(r) : ap.msg);
  const st = await db.query(`select status from clinics where id='${C.pending}'`);
  check("[承認] clinics.status が active になっている", st.rows[0].status === "active");
  const ev = await db.query(`select * from clinic_status_events where clinic_id='${C.pending}'`);
  check("[承認] 監査イベントが1件(実行者ID・メール小文字化・変更前後・日時)",
    ev.rows.length === 1 && ev.rows[0].actor_user_id === U.ops && ev.rows[0].actor_email === "ops@example.test"
    && ev.rows[0].from_status === "pending_approval" && ev.rows[0].to_status === "active" && ev.rows[0].created_at,
    JSON.stringify({ n: ev.rows.length, email: ev.rows[0]?.actor_email }));

  const dup = await call(C.pending, "active", null);
  check("[重複承認] active への再承認は invalid_transition(55000)で拒否", !dup.ok && dup.code === "55000", dup.ok ? "成功してしまった" : dup.code);
  const evAfterDup = await db.query(`select count(*)::int n from clinic_status_events where clinic_id='${C.pending}'`);
  check("[重複承認] 拒否時にイベントが増えない", evAfterDup.rows[0].n === 1);
  const act = await call(C.pending, "rejected", "停止したい");
  check("[不正遷移] active → rejected は拒否", !act.ok && act.code === "55000", act.ok ? "成功" : act.code);

  // 別の承認待ち医院で却下・再承認
  await db.exec(`insert into clinics (id,name,status) values ('10000000-0000-0000-0000-0000000000f1','rej','pending_approval')`);
  const rj0 = await call("10000000-0000-0000-0000-0000000000f1", "rejected", null);
  check("[却下] 理由なしの reject は reason_required(22023)", !rj0.ok && rj0.code === "22023" && /reason_required/.test(rj0.msg), rj0.ok ? "成功" : `${rj0.code} ${rj0.msg}`);
  const rj1 = await call("10000000-0000-0000-0000-0000000000f1", "rejected", "   ");
  check("[却下] 空白だけの理由も拒否", !rj1.ok && rj1.code === "22023");
  const rj2 = await call("10000000-0000-0000-0000-0000000000f1", "rejected", "書類不備");
  check("[却下] 理由ありの reject が成功(action=reject)", rj2.ok && rj2.rows[0].r.action === "reject", rj2.ok ? "" : rj2.msg);
  const rjDup = await call("10000000-0000-0000-0000-0000000000f1", "rejected", "again");
  check("[重複却下] rejected → rejected は拒否", !rjDup.ok && rjDup.code === "55000");
  const ra0 = await call("10000000-0000-0000-0000-0000000000f1", "active", null);
  check("[再承認] 理由なしの reapprove は拒否", !ra0.ok && ra0.code === "22023");
  const ra1 = await call("10000000-0000-0000-0000-0000000000f1", "active", "是正を確認");
  check("[再承認] 理由ありの rejected → active が成功(action=reapprove)", ra1.ok && ra1.rows[0].r.action === "reapprove", ra1.ok ? "" : ra1.msg);

  const nf = await call("10000000-0000-0000-0000-00000000dead", "active", null);
  check("[存在しない医院] clinic_not_found(P0002)", !nf.ok && nf.code === "P0002");
  const bs = await call(C.pending, "pending_approval", null);
  check("[不正な遷移先] pending_approval への変更は invalid_status", !bs.ok && bs.code === "22023");
  const ba = await commit("service_role", null, `select public.ops_change_clinic_status($1::uuid,'active',null,'a@b',null)`, [C.c1]);
  check("[実行者なし] actor_user_id が null は invalid_actor", !ba.ok && ba.code === "22023");
  const be = await commit("service_role", null, `select public.ops_change_clinic_status($1::uuid,'active',$2::uuid,'  ',null)`, [C.c1, U.ops]);
  check("[実行者なし] actor_email が空は invalid_actor", !be.ok && be.code === "22023");

  // 追記専用(所有者でも変更不可)
  const upd = await as("postgres", null, `update clinic_status_events set reason='tamper'`);
  const del = await as("postgres", null, `delete from clinic_status_events`);
  const trn = await as("postgres", null, `truncate clinic_status_events`);
  check("[追記専用] postgres でも UPDATE/DELETE/TRUNCATE が拒否される", !upd.ok && !del.ok && !trn.ok && upd.code === "55000" && del.code === "55000" && trn.code === "55000",
    `${upd.code}/${del.code}/${trn.code}`);
  const delClinic = await as("postgres", null, `delete from clinics where id='${C.pending}'`);
  check("[履歴保持] 監査イベントを持つ医院は削除できない(on delete restrict)", !delClinic.ok, delClinic.ok ? "削除できた" : delClinic.code);

  // 9. 既存3医院への影響なし
  const ex = await db.query(`select id, status from clinics where id in ('${C.c1}','${C.c2}','${C.c3}') order by id`);
  check("[既存3医院] status は全て active のまま", ex.rows.length === 3 && ex.rows.every((x) => x.status === "active"), JSON.stringify(ex.rows.map((x) => x.status)));
  const exEv = await db.query(`select count(*)::int n from clinic_status_events where clinic_id in ('${C.c1}','${C.c2}','${C.c3}')`);
  check("[既存3医院] 履歴を捏造していない(イベント0件=履歴不明のまま)", exEv.rows[0].n === 0);
  const exUsers = await db.query(`select count(*)::int n from clinic_users where role='owner' and clinic_id in ('${C.c1}','${C.c2}','${C.c3}')`);
  check("[既存3医院] clinic_users(owner)は変わらない", exUsers.rows[0].n === 3);

  // 10. 020 後に作られる新規テーブルへ書き込み権限が自動付与されない
  await db.exec(`create table zz_new_after_020 (id int)`);
  const nt = await db.query(`select privilege_type from information_schema.role_table_grants
    where table_name='zz_new_after_020' and grantee in ('anon','authenticated')`);
  check("[既定権限] 020 後の新規テーブルには SELECT 以外が付与されない", nt.rows.every((x) => x.privilege_type === "SELECT"),
    nt.rows.map((x) => x.privilege_type).join(","));

  // ── 結果 ───────────────────────────────────────────────────────────────
  console.log(lines.join("\n"));
  console.log(`\nTOTAL: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
