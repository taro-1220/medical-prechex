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

export type ConfirmWriteAction = "consent" | "setup_intent" | "setup_intent_confirm" | "register_email" | "verify_identity";

/** 操作ごとに書き込み（状態変更）を許可する状態を判定する */
export function canWrite(state: ConfirmState, action: ConfirmWriteAction): boolean {
  switch (action) {
    case "consent":
    case "setup_intent":
    case "setup_intent_confirm":
      return state === "upcoming_pending";
    case "register_email":
      return state === "upcoming_pending" || state === "upcoming_consented";
    case "verify_identity":
      return state === "upcoming_pending" || state === "upcoming_consented" || state === "past_consented_today";
  }
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
