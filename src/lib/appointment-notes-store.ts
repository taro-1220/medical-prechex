// 予約への備考（追記のみ・削除修正不可）。appointment_notes の読み書き。
// migration 030未適用(テーブル不存在=42P01)の間は、安全側で空一覧・unsupportedを返す。
import { getSupabase } from "./supabase";

export type AppointmentNoteKind = "note" | "staff_change";

export interface AppointmentNote {
  id: string;
  appointmentId: string;
  clinicId: string;
  kind: AppointmentNoteKind;
  body: string;
  createdByName: string;
  createdAt: string;
}

function toNote(row: Record<string, unknown>): AppointmentNote {
  return {
    id: row.id as string,
    appointmentId: row.appointment_id as string,
    clinicId: row.clinic_id as string,
    kind: row.kind as AppointmentNoteKind,
    body: row.body as string,
    createdByName: row.created_by_name as string,
    createdAt: row.created_at as string,
  };
}

export type AddAppointmentNoteResult =
  | { ok: true; note: AppointmentNote }
  | { ok: false; reason: "invalid" | "unsupported" };

export async function addAppointmentNote(
  appointmentId: string,
  clinicId: string,
  kind: AppointmentNoteKind,
  rawBody: string,
  createdByName: string,
): Promise<AddAppointmentNoteResult> {
  const body = rawBody.trim();
  if (body.length < 1 || body.length > 500) return { ok: false, reason: "invalid" };

  const { data, error } = await getSupabase()
    .from("appointment_notes")
    .insert({ appointment_id: appointmentId, clinic_id: clinicId, kind, body, created_by_name: createdByName })
    .select()
    .single();
  if (error) {
    if (error.code === "42P01") return { ok: false, reason: "unsupported" };
    throw new Error(error.message);
  }
  return { ok: true, note: toNote(data) };
}

/** migration未適用時は空配列（新規・追記フォームは出すが、履歴は無いものとして表示する） */
export async function listAppointmentNotes(appointmentId: string): Promise<AppointmentNote[]> {
  const { data, error } = await getSupabase()
    .from("appointment_notes")
    .select("*")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []).map(toNote);
}
