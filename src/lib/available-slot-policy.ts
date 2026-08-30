// MVP+3: 空き枠自動通知の判定ロジック（純粋関数のみ）。DB・外部APIには触れない。
import type { AppointmentStatus } from "./types";

export const DAILY_NOTIFY_LIMIT = 2;

/**
 * キャンセルされた予約を「空き枠」として再募集してよいか。
 * 既存コードには診療時間・スタッフ稼働等の容量モデルが存在しないため、現時点で機械的に
 * 判定できる2条件のみを見る:
 *   1. キャンセル直前のstatusが既に'cancelled'ではなかった（同一キャンセルの二重発火防止）
 *   2. 予約日時が判定時点より未来である（過去の枠は再募集しない）
 * 将来、診療時間/スタッフ稼働等の容量モデルが導入された場合はこの関数へ条件を追加する。
 */
export function isEligibleForSlotReopen(params: {
  previousStatus: AppointmentStatus;
  appointmentAt: string;
  now: Date;
}): boolean {
  if (params.previousStatus === "cancelled") return false;
  return new Date(params.appointmentAt).getTime() > params.now.getTime();
}

/** 同一患者への通知回数制限（初期仕様: 1日最大2回。直近24時間のローリングウィンドウで判定する簡易方式） */
export function isWithinDailyNotifyLimit(recentNotificationCount: number, limit: number = DAILY_NOTIFY_LIMIT): boolean {
  return recentNotificationCount < limit;
}
