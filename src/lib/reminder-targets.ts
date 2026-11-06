// 前日リマインドメールの対象抽出（副作用の無い純関数）。JST暦日は既存のtoJstDateKeyを再利用する。
import { toJstDateKey } from "./charge-policy";
import type { Appointment, AppointmentStatus } from "./types";

const TARGET_STATUSES: readonly AppointmentStatus[] = ["confirmation_pending", "confirmed", "ticket_issued"];

/** 患者が自ら登録したメール（確認画面）を優先し、無ければ予約作成時のメールを使う */
export function reminderEmailOf(appointment: Appointment): string {
  return appointment.patientRegisteredEmail || appointment.email;
}

/** "YYYY-MM-DD" の翌日の暦日キーを返す（月末・年末またぎも安全。実時刻ではなく日付計算専用） */
export function tomorrowJstDateKey(nowIso: string): string {
  const [y, m, d] = toJstDateKey(nowIso).split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/**
 * 翌日(JST暦日)の予約を対象にする。
 * 対象: status が confirmation_pending/confirmed/ticket_issued、患者メールあり、送信済みでない。
 * 除外: キャンセル・期限切れ・来院済み・完了・メール無し・送信記録あり。
 */
export function selectReminderTargets(
  appointments: Appointment[],
  nowIso: string,
  alreadySentAppointmentIds: ReadonlySet<string>,
): Appointment[] {
  const targetKey = tomorrowJstDateKey(nowIso);
  return appointments.filter((a) => {
    if (!TARGET_STATUSES.includes(a.status)) return false;
    if (!reminderEmailOf(a)) return false;
    if (alreadySentAppointmentIds.has(a.id)) return false;
    return toJstDateKey(a.appointmentAt) === targetKey;
  });
}
