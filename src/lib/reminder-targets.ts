// 前日・3日前リマインドメールの対象抽出（副作用の無い純関数）。JST暦日は既存のtoJstDateKeyを再利用する。
import { toJstDateKey } from "./charge-policy";
import type { Appointment, AppointmentStatus } from "./types";

const TARGET_STATUSES: readonly AppointmentStatus[] = ["confirmation_pending", "confirmed", "ticket_issued"];

/** 患者が自ら登録したメール（確認画面）を優先し、無ければ予約作成時のメールを使う */
export function reminderEmailOf(appointment: Appointment): string {
  return appointment.patientRegisteredEmail || appointment.email;
}

function jstDateKeyPlusDays(nowIso: string, days: number): string {
  const [y, m, d] = toJstDateKey(nowIso).split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" の翌日の暦日キーを返す（月末・年末またぎも安全。実時刻ではなく日付計算専用） */
export function tomorrowJstDateKey(nowIso: string): string {
  return jstDateKeyPlusDays(nowIso, 1);
}

/** 3日後(JST暦日)のキーを返す */
export function threeDaysAheadJstDateKey(nowIso: string): string {
  return jstDateKeyPlusDays(nowIso, 3);
}

/** JST暦日での日数差（to - from）。時刻は無視し日付のみで数える */
function jstDateKeyDiffDays(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = toJstDateKey(fromIso).split("-").map(Number);
  const [ty, tm, td] = toJstDateKey(toIso).split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export interface ReminderAlreadySent {
  threeDaysBefore: ReadonlySet<string>;
  dayBefore: ReadonlySet<string>;
}

export interface ReminderTargets {
  threeDaysBefore: Appointment[];
  dayBefore: Appointment[];
}

/**
 * 3日後・翌日(いずれもJST暦日)の予約をそれぞれ対象にする。
 * 対象: status が confirmation_pending/confirmed/ticket_issued、患者メールあり、送信済みでない。
 * 3日前は、予約作成時点から予約日まで3日未満だった予約を除く（前日のみ送る）。
 */
export function selectReminderTargets(
  appointments: Appointment[],
  nowIso: string,
  alreadySent: ReminderAlreadySent,
): ReminderTargets {
  const eligible = appointments.filter((a) => TARGET_STATUSES.includes(a.status) && !!reminderEmailOf(a));
  const threeDaysKey = threeDaysAheadJstDateKey(nowIso);
  const tomorrowKey = tomorrowJstDateKey(nowIso);

  const threeDaysBefore = eligible.filter(
    (a) =>
      toJstDateKey(a.appointmentAt) === threeDaysKey &&
      !alreadySent.threeDaysBefore.has(a.id) &&
      jstDateKeyDiffDays(a.createdAt, a.appointmentAt) >= 3,
  );
  const dayBefore = eligible.filter(
    (a) => toJstDateKey(a.appointmentAt) === tomorrowKey && !alreadySent.dayBefore.has(a.id),
  );

  return { threeDaysBefore, dayBefore };
}
