// 予約「内容」の選択肢（clinic_profile.appointment_description_options）のDBアクセス。
// migration 027未適用(列不存在=42703)の間は、安全側で初期の選択肢にフォールバックする。
import { getSupabase } from "./supabase";
import { DEFAULT_APPOINTMENT_DESCRIPTION_OPTIONS, isValidAppointmentDescriptionLabel } from "./appointment-description-options";

export async function getAppointmentDescriptionOptions(clinicId: string): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("clinic_profile")
    .select("appointment_description_options")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (error) return DEFAULT_APPOINTMENT_DESCRIPTION_OPTIONS;
  const options = data?.appointment_description_options as string[] | null | undefined;
  return options && options.length > 0 ? options : DEFAULT_APPOINTMENT_DESCRIPTION_OPTIONS;
}

export type AddAppointmentDescriptionOptionResult =
  | { ok: true; options: string[] }
  | { ok: false; reason: "duplicate" | "invalid" | "unsupported" };

export async function addAppointmentDescriptionOption(
  clinicId: string,
  rawLabel: string,
): Promise<AddAppointmentDescriptionOptionResult> {
  const label = rawLabel.trim();
  if (!isValidAppointmentDescriptionLabel(label)) return { ok: false, reason: "invalid" };

  const sb = getSupabase();
  const { data, error } = await sb
    .from("clinic_profile")
    .select("appointment_description_options")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (error) {
    if (error.code === "42703") return { ok: false, reason: "unsupported" };
    throw new Error(error.message);
  }

  const current = (data?.appointment_description_options as string[] | null) ?? DEFAULT_APPOINTMENT_DESCRIPTION_OPTIONS;
  if (current.includes(label)) return { ok: false, reason: "duplicate" };

  const next = [...current, label];
  const { error: upsertErr } = await sb
    .from("clinic_profile")
    .upsert({ clinic_id: clinicId, appointment_description_options: next }, { onConflict: "clinic_id" });
  if (upsertErr) {
    if (upsertErr.code === "42703") return { ok: false, reason: "unsupported" };
    throw new Error(upsertErr.message);
  }

  return { ok: true, options: next };
}
