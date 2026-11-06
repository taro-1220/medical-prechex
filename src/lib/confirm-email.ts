// 確認URLの自動送信・再送の共通処理（予約作成時の自動送信・スタッフの再送ボタンから共用）。
// 前日リマインドの送信記録(appointment_notification_log)には触れない（別の送信種別のため）。
import { getSupabase } from "./supabase";
import { sendConfirmationRequestEmail, isEmailSendEnabled } from "./notify-email";
import type { Appointment } from "./types";

export type SendConfirmationEmailResult =
  | { ok: true; sentAt: string }
  | { ok: false; reason: "no_email" | "disabled" | "send_failed" | "invalid_status" };

function isReminderSendEnabled(): boolean {
  return process.env.ENABLE_REMINDER_SEND === "true";
}

const BLOCKED_STATUSES = new Set(["cancelled", "expired"]);

/** 成功時のみ appointments.email_sent_at を更新する。失敗しても呼び出し元の処理は継続してよい。 */
export async function sendConfirmationEmailAndRecord(appt: Appointment): Promise<SendConfirmationEmailResult> {
  if (BLOCKED_STATUSES.has(appt.status)) return { ok: false, reason: "invalid_status" };
  if (!appt.email) return { ok: false, reason: "no_email" };
  if (!isReminderSendEnabled() || !isEmailSendEnabled()) return { ok: false, reason: "disabled" };

  const sb = getSupabase();
  let clinicPhone = "";
  if (appt.clinicId) {
    const { data } = await sb.from("clinics").select("phone").eq("id", appt.clinicId).maybeSingle();
    clinicPhone = (data?.phone as string | undefined) ?? "";
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const result = await sendConfirmationRequestEmail({
    to: appt.email,
    clinicName: appt.clinicName,
    clinicPhone,
    appointmentAt: appt.appointmentAt,
    confirmUrl: `${appUrl}/confirm/${appt.token}`,
  });
  if (!result.ok) return { ok: false, reason: "send_failed" };

  const sentAt = new Date().toISOString();
  const { error } = await sb.from("appointments").update({ email_sent_at: sentAt }).eq("id", appt.id);
  if (error) throw new Error(error.message);

  return { ok: true, sentAt };
}
