// MVP+3: 空き枠自動通知＋先着再予約のDBアクセス
import { getSupabase } from "./supabase";
import type { Appointment, Patient } from "./types";

export type AvailableSlotStatus = "open" | "booked" | "closed";

export interface AvailableSlot {
  id: string;
  clinicId: string;
  sourceAppointmentId: string;
  appointmentAt: string;
  treatmentCategory: Appointment["treatmentCategory"];
  description: string;
  cancellationPolicy: string;
  baseAmount: number | null;
  cardRegistrationRequired: boolean;
  status: AvailableSlotStatus;
  claimedByAppointmentId: string | null;
}

function toSlot(row: Record<string, unknown>): AvailableSlot {
  return {
    id:                        row.id as string,
    clinicId:                  row.clinic_id as string,
    sourceAppointmentId:       row.source_appointment_id as string,
    appointmentAt:             row.appointment_at as string,
    treatmentCategory:         row.treatment_category as Appointment["treatmentCategory"],
    description:               row.description as string,
    cancellationPolicy:        row.cancellation_policy as string,
    baseAmount:                (row.base_amount as number | null) ?? null,
    cardRegistrationRequired:  row.card_registration_required as boolean,
    status:                    row.status as AvailableSlotStatus,
    claimedByAppointmentId:    (row.claimed_by_appointment_id as string | null) ?? null,
  };
}

export async function getClinicAutoNotifySetting(clinicId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("clinic_profile")
    .select("auto_notify_available_slot")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.auto_notify_available_slot as boolean | null) ?? false;
}

export async function setClinicAutoNotifySetting(clinicId: string, enabled: boolean): Promise<void> {
  const { error } = await getSupabase()
    .from("clinic_profile")
    .upsert({ clinic_id: clinicId, auto_notify_available_slot: enabled }, { onConflict: "clinic_id" });
  if (error) throw new Error(error.message);
}

/**
 * キャンセルされた予約から空き枠を1件作成する。source_appointment_id のunique制約により
 * 同一キャンセルからの二重生成を防ぐ（衝突時は既存行を返す＝冪等）。
 */
export async function createAvailableSlotFromCancelledAppointment(appt: Appointment): Promise<AvailableSlot> {
  if (!appt.clinicId) throw new Error("clinicId is required");
  const { data, error } = await getSupabase()
    .from("available_slots")
    .insert({
      clinic_id:                  appt.clinicId,
      source_appointment_id:      appt.id,
      appointment_at:             appt.appointmentAt,
      treatment_category:         appt.treatmentCategory,
      // 空き枠の説明として使う診療内容は、元患者の個人的な受診理由と紐づいた自由記述の可能性があるため
      // 引き継がない（新規患者向けには汎用文言を使う。運用ルール13/患者情報非開示の要件に合わせる）
      description:                "",
      cancellation_policy:        appt.cancellationPolicy,
      base_amount:                appt.baseAmount,
      card_registration_required: appt.cardRegistrationRequired,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      // unique(source_appointment_id) 衝突 = 既に生成済み。既存行を返す
      const existing = await getSupabase()
        .from("available_slots")
        .select()
        .eq("source_appointment_id", appt.id)
        .single();
      if (existing.error) throw new Error(existing.error.message);
      return toSlot(existing.data);
    }
    throw new Error(error.message);
  }
  return toSlot(data);
}

/** 空き枠情報を通知トークンから取得する（患者向け予約画面の表示用） */
export async function getSlotByNotificationToken(token: string): Promise<{
  slot: AvailableSlot;
  clinicName: string;
  notificationId: string;
} | null> {
  const { data, error } = await getSupabase()
    .from("slot_notifications")
    .select("id, available_slots(*, clinics(name))")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const slotRow = data.available_slots as unknown as Record<string, unknown> & { clinics: { name: string } };
  if (!slotRow) return null;
  return {
    slot: toSlot(slotRow),
    clinicName: slotRow.clinics?.name ?? "",
    notificationId: data.id as string,
  };
}

/**
 * 先着制御の要。単一UPDATE文（WHERE status='open'）はPostgresでは1行に対して原子的なため、
 * 複数リクエストが同時に来ても更新できるのは最初の1件だけになる。アプリ側のロックは使わない。
 */
export async function claimAvailableSlot(slotId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("available_slots")
    .update({ status: "booked" })
    .eq("id", slotId)
    .eq("status", "open")
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/** 予約作成が失敗した場合のロールバック（ベストエフォート） */
export async function reopenAvailableSlot(slotId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("available_slots")
    .update({ status: "open" })
    .eq("id", slotId)
    .eq("status", "booked");
  if (error) throw new Error(error.message);
}

export async function markSlotClaimed(slotId: string, appointmentId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("available_slots")
    .update({ claimed_by_appointment_id: appointmentId, closed_at: new Date().toISOString() })
    .eq("id", slotId);
  if (error) throw new Error(error.message);
}

export async function markNotificationClaimed(notificationId: string, resultingAppointmentId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("slot_notifications")
    .update({ claimed_at: new Date().toISOString(), resulting_appointment_id: resultingAppointmentId })
    .eq("id", notificationId);
  if (error) throw new Error(error.message);
}

/** 通知対象患者の抽出: 同院登録・通知ON・連絡先ありのみ（キャンセル待ち登録の有無は条件にしない） */
export async function findNotifiablePatients(clinicId: string, excludePatientId: string | null): Promise<Patient[]> {
  let query = getSupabase()
    .from("patients")
    .select("id, name, phone, email")
    .eq("clinic_id", clinicId)
    .eq("notify_available_slot", true)
    .or("phone.neq.,email.neq.");
  if (excludePatientId) query = query.neq("id", excludePatientId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({
    id: r.id as string,
    name: r.name as string,
    phone: r.phone as string,
    email: r.email as string,
  }));
}

/** 直近ウィンドウ内でその患者へ送信済みの通知件数（1日あたり上限判定用） */
export async function countRecentNotifications(patientId: string, sinceIso: string): Promise<number> {
  const { count, error } = await getSupabase()
    .from("slot_notifications")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patientId)
    .not("sent_at", "is", null)
    .gte("sent_at", sinceIso);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export interface InsertSlotNotificationInput {
  availableSlotId: string;
  clinicId: string;
  patientId: string;
  channel: "email" | "sms" | "line";
  dryRun: boolean;
}

export async function insertSlotNotification(input: InsertSlotNotificationInput): Promise<{ id: string; token: string }> {
  const token = crypto.randomUUID();
  const { data, error } = await getSupabase()
    .from("slot_notifications")
    .insert({
      available_slot_id: input.availableSlotId,
      clinic_id:          input.clinicId,
      patient_id:          input.patientId,
      token,
      channel:            input.channel,
      dry_run:             input.dryRun,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, token };
}

export async function markSlotNotificationSent(
  id: string,
  patch: { dryRun: boolean; sentAt: string | null; error: string | null },
): Promise<void> {
  const { error } = await getSupabase()
    .from("slot_notifications")
    .update({ dry_run: patch.dryRun, sent_at: patch.sentAt, send_error: patch.error })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getPatientUnsubscribeToken(patientId: string): Promise<string> {
  const { data, error } = await getSupabase()
    .from("patients")
    .select("unsubscribe_token")
    .eq("id", patientId)
    .single();
  if (error) throw new Error(error.message);
  return data.unsubscribe_token as string;
}

export async function getPatientNotifyPreferenceByAppointmentToken(apptToken: string): Promise<boolean | null> {
  const { data: appt, error: apptErr } = await getSupabase()
    .from("appointments")
    .select("patient_id")
    .eq("token", apptToken)
    .maybeSingle();
  if (apptErr) throw new Error(apptErr.message);
  if (!appt?.patient_id) return null;
  const { data, error } = await getSupabase()
    .from("patients")
    .select("notify_available_slot")
    .eq("id", appt.patient_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.notify_available_slot as boolean | null) ?? false;
}

export async function setPatientNotifyPreferenceByAppointmentToken(apptToken: string, enabled: boolean): Promise<boolean> {
  const { data: appt, error: apptErr } = await getSupabase()
    .from("appointments")
    .select("patient_id")
    .eq("token", apptToken)
    .maybeSingle();
  if (apptErr) throw new Error(apptErr.message);
  if (!appt?.patient_id) return false;
  const { error } = await getSupabase()
    .from("patients")
    .update({ notify_available_slot: enabled })
    .eq("id", appt.patient_id);
  if (error) throw new Error(error.message);
  return true;
}

/** メール本文の配信停止リンク用。unsubscribe_tokenは既存患者に対しDBデフォルトで生成済みのため検索のみでよい */
export async function unsubscribeByToken(unsubscribeToken: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("patients")
    .update({ notify_available_slot: false })
    .eq("unsubscribe_token", unsubscribeToken)
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}
