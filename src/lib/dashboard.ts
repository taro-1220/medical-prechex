// MVP+2 C-5: 医院ダッシュボードの集計（純粋関数。DB/Stripeには触れない）
//
// 無断（no-show）はappointments.statusに専用値を持たない（既存enumを変更しない方針のため）。
// cron（E-2）がno-show課金を実行した際、charge_eventsのdetailに "no_show:" 接頭辞を書く
// 規約とし、ダッシュボードはそれを数える。

import type { Appointment, ChargeEvent } from "./types";

export interface ChargeDashboard {
  totalAppointments: number;
  cancelledCount: number;
  cancelRate: number;
  noShowCount: number;
  collectedAmount: number;
  collectedCount: number;
  failedChargeCount: number;
  /** キャンセルポリシー適用対象だった予約のキャンセル率 */
  policyAppliedCancelRate: number;
  /** policyAppliedCancelRateの母数（Phase J: 母数が小さい率に件数を併記するため） */
  policyAppliedTotal: number;
  policyAppliedCancelledCount: number;
  /** キャンセルポリシー対象外だった予約のキャンセル率 */
  policyNotAppliedCancelRate: number;
  policyNotAppliedTotal: number;
  policyNotAppliedCancelledCount: number;
}

export const NO_SHOW_DETAIL_PREFIX = "no_show:";

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function computeChargeDashboard(appointments: Appointment[], chargeEvents: ChargeEvent[]): ChargeDashboard {
  const total = appointments.length;
  const cancelled = appointments.filter((a) => a.status === "cancelled");

  const applied = appointments.filter((a) => a.cancelPolicyApplied);
  const notApplied = appointments.filter((a) => !a.cancelPolicyApplied);
  const cancelledApplied = applied.filter((a) => a.status === "cancelled").length;
  const cancelledNotApplied = notApplied.filter((a) => a.status === "cancelled").length;

  const noShowAppointmentIds = new Set(
    chargeEvents.filter((e) => e.detail?.startsWith(NO_SHOW_DETAIL_PREFIX)).map((e) => e.appointmentId),
  );

  const collected = chargeEvents.filter((e) => e.eventType === "charge" && !e.dryRun);
  const collectedAmount = collected.reduce((sum, e) => sum + (e.amount ?? 0), 0);

  const failedChargeCount = appointments.filter((a) => a.chargeStatus === "failed").length;

  return {
    totalAppointments: total,
    cancelledCount: cancelled.length,
    cancelRate: rate(cancelled.length, total),
    noShowCount: noShowAppointmentIds.size,
    collectedAmount,
    collectedCount: collected.length,
    failedChargeCount,
    policyAppliedCancelRate: rate(cancelledApplied, applied.length),
    policyAppliedTotal: applied.length,
    policyAppliedCancelledCount: cancelledApplied,
    policyNotAppliedCancelRate: rate(cancelledNotApplied, notApplied.length),
    policyNotAppliedTotal: notApplied.length,
    policyNotAppliedCancelledCount: cancelledNotApplied,
  };
}
