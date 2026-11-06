// 確認URLの自動送信・再送の共通処理（予約作成時の自動送信・スタッフの再送ボタンから共用）。
// 前日リマインドの送信記録(appointment_notification_log)には触れない（別の送信種別のため）。
import { getSupabase } from "./supabase";
import { getAppointmentById } from "./store";
import { sendConfirmationRequestEmail, isEmailSendEnabled } from "./notify-email";
import { setEmailLastFailedAt } from "./notification-run-store";
import type { Appointment } from "./types";

export type SendConfirmationEmailResult =
  | { ok: true; sentAt: string }
  | { ok: false; reason: "no_email" | "disabled" | "send_failed" | "invalid_status" | "stale" };

function isReminderSendEnabled(): boolean {
  return process.env.ENABLE_REMINDER_SEND === "true";
}

const BLOCKED_STATUSES = new Set(["cancelled", "expired"]);

/**
 * 成功時のみ appointments.email_sent_at を更新する。失敗しても呼び出し元の処理は継続してよい。
 * 送信の直前に予約を再取得し、キャンセル・期限切れ・日時変更があれば送らない（stale/invalid_status）。
 */
export async function sendConfirmationEmailAndRecord(appt: Appointment): Promise<SendConfirmationEmailResult> {
  if (BLOCKED_STATUSES.has(appt.status)) return { ok: false, reason: "invalid_status" };
  if (!appt.email) return { ok: false, reason: "no_email" };
  if (!isReminderSendEnabled() || !isEmailSendEnabled()) return { ok: false, reason: "disabled" };

  // 送信直前の再確認: 対象抽出〜送信までの間にキャンセル・日時変更があれば送らない
  const fresh = await getAppointmentById(appt.id);
  if (!fresh) return { ok: false, reason: "invalid_status" };
  if (BLOCKED_STATUSES.has(fresh.status) || fresh.status === "checked_in" || fresh.status === "completed") {
    return { ok: false, reason: "invalid_status" };
  }
  if (fresh.appointmentAt !== appt.appointmentAt) return { ok: false, reason: "stale" };

  const sb = getSupabase();
  let clinicPhone = "";
  if (fresh.clinicId) {
    const { data } = await sb.from("clinics").select("phone").eq("id", fresh.clinicId).maybeSingle();
    clinicPhone = (data?.phone as string | undefined) ?? "";
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const result = await sendConfirmationRequestEmail({
    to: fresh.email,
    clinicName: fresh.clinicName,
    clinicPhone,
    appointmentAt: fresh.appointmentAt,
    confirmUrl: `${appUrl}/confirm/${fresh.token}`,
  });
  if (!result.ok) {
    await setEmailLastFailedAt(fresh.id, new Date().toISOString());
    return { ok: false, reason: "send_failed" };
  }

  const sentAt = new Date().toISOString();
  const { error } = await sb.from("appointments").update({ email_sent_at: sentAt }).eq("id", fresh.id);
  if (error) throw new Error(error.message);
  // email_last_failed_at(migration 026)のクリアは失敗しても構わない(未適用でも本処理は成功済み)
  await setEmailLastFailedAt(fresh.id, null);

  return { ok: true, sentAt };
}
