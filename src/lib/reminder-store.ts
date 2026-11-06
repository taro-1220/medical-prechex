// 前日リマインドの送信記録(appointment_notification_log)アクセス。
// migration 022未適用(テーブル不存在=42P01)の間は、安全側で「送信済み扱い」にし実送信させない。
import { getSupabase } from "./supabase";

const NOTIFICATION_TYPE_REMINDER = "reminder_day_before";

export async function reminderAlreadySentIds(appointmentIds: string[]): Promise<Set<string>> {
  if (appointmentIds.length === 0) return new Set();
  const { data, error } = await getSupabase()
    .from("appointment_notification_log")
    .select("appointment_id")
    .eq("notification_type", NOTIFICATION_TYPE_REMINDER)
    .in("appointment_id", appointmentIds);
  if (error) {
    if (error.code === "42P01") return new Set(appointmentIds);
    throw new Error(error.message);
  }
  return new Set((data ?? []).map((r) => r.appointment_id as string));
}

/** 送信成功後に記録する。二重送信防止の最終防壁はDBのunique制約（23505は無視してよい）。 */
export async function recordReminderSent(appointmentId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("appointment_notification_log")
    .insert({ appointment_id: appointmentId, notification_type: NOTIFICATION_TYPE_REMINDER });
  if (error && error.code !== "23505" && error.code !== "42P01") {
    throw new Error(error.message);
  }
}
