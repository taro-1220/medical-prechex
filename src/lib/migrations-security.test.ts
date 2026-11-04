// 承認制迂回の防止(migration 019/020/021)の静的ガード。SQL の実行検証は supabase/tests/verify-020-021.cjs。
// ここでは「重要な文が消えていないこと」「適用順が崩れていないこと」だけを守る。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const strip = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("migration 019: default のみ変更し既存行を触らない", () => {
  const sql = strip(read("019_clinics_status_default_pending.sql"));
  it("status の default を pending_approval にする", () => {
    expect(sql).toMatch(/alter column status set default 'pending_approval'/i);
  });
  it("既存行を更新しない(UPDATE / DELETE / INSERT を含まない)", () => {
    expect(sql).not.toMatch(/\b(update|delete|insert)\b/i);
  });
});

describe("migration 020: anon/authenticated の書き込み権限を撤去する", () => {
  const sql = strip(read("020_revoke_client_writes.sql"));
  it("全 public テーブルから insert/update/delete/truncate を anon, authenticated へ REVOKE する", () => {
    expect(sql).toMatch(/revoke insert, update, delete, truncate[\s\S]*from public, anon, authenticated/i);
  });
  it("書き込み系ポリシー(INSERT/UPDATE/DELETE)を削除し、SELECT ポリシーは対象にしない", () => {
    expect(sql).toMatch(/cmd in \('INSERT', 'UPDATE', 'DELETE'\)/);
    expect(sql).not.toMatch(/'SELECT'/);
  });
  it("service_role と auth スキーマには触れない", () => {
    expect(sql).not.toMatch(/service_role/i);
    expect(sql).not.toMatch(/\bauth\./i);
  });
  it("SELECT 権限を REVOKE しない", () => {
    expect(sql).not.toMatch(/revoke[^;]*\bselect\b/i);
  });
});

describe("migration 021: 監査付き状態変更", () => {
  const sql = strip(read("021_clinic_status_events.sql"));
  it("SECURITY DEFINER 関数は search_path を固定している", () => {
    const fn = sql.slice(sql.indexOf("function public.ops_change_clinic_status"));
    expect(fn).toMatch(/security definer\s+set search_path = ''/i);
  });
  it("EXECUTE を public/anon/authenticated から剥奪し service_role のみに付与する", () => {
    expect(sql).toMatch(/revoke all on function public\.ops_change_clinic_status\([^)]*\)\s+from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.ops_change_clinic_status\([^)]*\)\s+to service_role/i);
    const grantees = [...sql.matchAll(/grant execute on function[^;]*?\bto\s+([^;]+);/gi)].map((m) => m[1].trim());
    expect(grantees).toEqual(["service_role"]);
  });
  it("行ロックで同時実行を直列化し、許可する遷移を3つに限定している", () => {
    expect(sql).toMatch(/from public\.clinics c where c\.id = p_clinic_id for update/i);
    expect(sql).toMatch(/v_from = 'pending_approval' and p_to_status = 'active'/);
    expect(sql).toMatch(/v_from = 'pending_approval' and p_to_status = 'rejected'/);
    expect(sql).toMatch(/v_from = 'rejected' and p_to_status = 'active'/);
    expect(sql).toMatch(/invalid_transition/);
  });
  it("監査テーブルは追記専用・RLS 有効・service_role は SELECT のみ", () => {
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/revoke all on table public\.clinic_status_events from public, anon, authenticated, service_role/i);
    expect(sql).toMatch(/grant select on table public\.clinic_status_events to service_role/i);
    expect(sql).toMatch(/before update or delete on public\.clinic_status_events/i);
    expect(sql).toMatch(/before truncate on public\.clinic_status_events/i);
  });
  it("clinics.status の直接変更を拒否するトリガーがある", () => {
    expect(sql).toMatch(/before update of status on public\.clinics/i);
  });
  it("既存医院の履歴を作らない(バックフィルの INSERT がない)", () => {
    const withoutFn = sql.replace(/\$\$[\s\S]*?\$\$/g, ""); // 関数本体($$...$$)を除いたトップレベルの文
    expect(withoutFn).not.toMatch(/insert into public\.clinic_status_events/i);
    expect(withoutFn).not.toMatch(/update public\.clinics/i);
  });
});
