// /confirm/[token] の表示・書き込み可否を決める状態判定（副作用の無い純関数）。
// JST暦日の算出は既存のtoJstDateKeyを再利用する。締め切りは予約の開始時刻（appointmentAt）。
import { toJstDateKey } from "./charge-policy";
import type { AppointmentStatus } from "./types";

export type ConfirmState =
  | "upcoming_pending"
  | "upcoming_consented"
  | "past_pending"
  | "past_consented_today"
  | "past_closed"
  | "cancelled";

/** 同意・カード登録・メール登録・本人確認の書き込みを許可する唯一の状態 */
export function canWrite(state: ConfirmState): boolean {
  return state === "upcoming_pending";
}

export function determineConfirmState(status: AppointmentStatus, appointmentAt: string, nowIso: string): ConfirmState {
  if (status === "cancelled" || status === "expired") return "cancelled";
  if (status === "checked_in" || status === "completed") return "past_closed";

  const started = new Date(appointmentAt).getTime() <= new Date(nowIso).getTime();

  if (status === "confirmation_pending") {
    return started ? "past_pending" : "upcoming_pending";
  }

  // confirmed / ticket_issued
  if (!started) return "upcoming_consented";
  return toJstDateKey(appointmentAt) === toJstDateKey(nowIso) ? "past_consented_today" : "past_closed";
}
