// 前日・3日前リマインドの送信記録(appointment_notification_log)アクセス。
// migration 022未適用(テーブル不存在=42P01)の間は、安全側で「送信済み扱い」にし実送信させない。
// notification_type は自由文字列の列（migration 022に列追加不要。一意制約は(appointment_id, notification_type)）。
import { getSupabase } from "./supabase";

/** 既存運用との互換のため、前日リマインドの値は従来どおり "reminder_day_before" を使う */
export const REMINDER_NOTIFICATION_TYPE = {
  threeDaysBefore: "reminder_three_days_before",
  dayBefore: "reminder_day_before",
} as const;

export async function reminderAlreadySentIds(appointmentIds: string[], notificationType: string): Promise<Set<string>> {
  if (appointmentIds.length === 0) return new Set();
  const { data, error } = await getSupabase()
    .from("appointment_notification_log")
    .select("appointment_id")
    .eq("notification_type", notificationType)
    .in("appointment_id", appointmentIds);
  if (error) {
    if (error.code === "42P01") return new Set(appointmentIds);
    throw new Error(error.message);
  }
  return new Set((data ?? []).map((r) => r.appointment_id as string));
}

/** 送信成功後に記録する。二重送信防止の最終防壁はDBのunique制約（23505は無視してよい）。 */
export async function recordReminderSent(appointmentId: string, notificationType: string): Promise<void> {
  const { error } = await getSupabase()
    .from("appointment_notification_log")
    .insert({ appointment_id: appointmentId, notification_type: notificationType });
  if (error && error.code !== "23505" && error.code !== "42P01") {
    throw new Error(error.message);
  }
}
