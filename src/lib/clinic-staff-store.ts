// 受付の「担当」選択用の医院スタッフ名簿(clinic_staff_members)。clinic_usersとは別（ログイン不要）。
// migration 029未適用(テーブル不存在=42P01)の間は、安全側で空一覧・unsupportedを返す。
import { getSupabase } from "./supabase";
import type { ClinicStaffMember } from "./types";

function toStaffMember(row: Record<string, unknown>): ClinicStaffMember {
  return {
    id: row.id as string,
    clinicId: row.clinic_id as string,
    name: row.name as string,
    active: row.active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listClinicStaff(clinicId: string, activeOnly = false): Promise<ClinicStaffMember[]> {
  let query = getSupabase().from("clinic_staff_members").select("*").eq("clinic_id", clinicId);
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []).map(toStaffMember);
}

export async function getClinicStaffMember(id: string): Promise<ClinicStaffMember | undefined> {
  const { data, error } = await getSupabase().from("clinic_staff_members").select("*").eq("id", id).maybeSingle();
  if (error || !data) return undefined;
  return toStaffMember(data);
}

export type AddClinicStaffResult = { ok: true; member: ClinicStaffMember } | { ok: false; reason: "invalid" | "unsupported" };

export async function addClinicStaffMember(clinicId: string, rawName: string): Promise<AddClinicStaffResult> {
  const name = rawName.trim();
  if (name.length < 1 || name.length > 40) return { ok: false, reason: "invalid" };
  const { data, error } = await getSupabase()
    .from("clinic_staff_members")
    .insert({ clinic_id: clinicId, name })
    .select()
    .single();
  if (error) return { ok: false, reason: "unsupported" };
  return { ok: true, member: toStaffMember(data) };
}

/** 無効化のみ（物理削除はしない）。既に保存済みの予約のstaff_name_snapshotは変えない */
export async function deactivateClinicStaffMember(clinicId: string, staffMemberId: string): Promise<boolean> {
  const { error } = await getSupabase()
    .from("clinic_staff_members")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", staffMemberId)
    .eq("clinic_id", clinicId);
  return !error;
}
