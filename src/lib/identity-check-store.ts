// 本人確認の総当たりロック状態(appointments.identity_check_*)の読み書き。
// migration 025未適用（列不存在=42703）の間は、ロック判定・記録ができないため「ロックなし」として
// 動く（本人確認自体はDBに依存しないため機能し続ける。ロック機能だけが効かない）。
import { getSupabase } from "./supabase";
import { MAX_FAILURES, LOCK_MINUTES } from "./identity-check";

export async function isIdentityCheckLocked(appointmentId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("appointments")
    .select("identity_check_locked_until")
    .eq("id", appointmentId)
    .maybeSingle();
  if (error) return false;
  const lockedUntil = data?.identity_check_locked_until as string | null | undefined;
  return !!lockedUntil && new Date(lockedUntil).getTime() > Date.now();
}

export async function recordIdentityCheckFailure(appointmentId: string): Promise<void> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("appointments")
    .select("identity_check_fail_count")
    .eq("id", appointmentId)
    .maybeSingle();
  if (error) return;
  const current = (data?.identity_check_fail_count as number | undefined) ?? 0;
  const next = current + 1;
  const patch: Record<string, unknown> = { identity_check_fail_count: next };
  if (next >= MAX_FAILURES) {
    patch.identity_check_locked_until = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
  }
  await sb.from("appointments").update(patch).eq("id", appointmentId);
}

export async function resetIdentityCheckFailures(appointmentId: string): Promise<void> {
  const sb = getSupabase();
  await sb
    .from("appointments")
    .update({ identity_check_fail_count: 0, identity_check_locked_until: null })
    .eq("id", appointmentId);
}
