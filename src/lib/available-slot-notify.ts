// MVP+3: キャンセル発生時の空き枠自動通知＋先着再予約のオーケストレーション（非純粋関数）。
// 判定ロジック本体は available-slot-policy.ts に集約し、ここでは呼び出し順序のみを扱う。
import type { Appointment, AppointmentStatus } from "./types";
import { isEligibleForSlotReopen, isWithinDailyNotifyLimit } from "./available-slot-policy";
import {
  getClinicAutoNotifySetting,
  createAvailableSlotFromCancelledAppointment,
  findNotifiablePatients,
  countRecentNotifications,
  insertSlotNotification,
  markSlotNotificationSent,
  getPatientUnsubscribeToken,
} from "./available-slots-store";
import { isEmailSendEnabled, sendAvailableSlotEmail } from "./notify-email";

const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export interface SlotReopenResult {
  triggered: boolean;
  reason?: string;
  slotId?: string;
  notifiedCount?: number;
  skippedByRateLimit?: number;
}

/**
 * キャンセル確定（appointments.status='cancelled'への更新）後に呼ぶ。
 * 呼び出し元のキャンセル処理・キャンセル料処理には一切影響しない設計（このモジュールの
 * 例外は投げず、呼び出し元は結果を見て握りつぶしてよい形にする）。
 */
export async function handleAppointmentCancelledForSlotReopen(
  cancelledAppt: Appointment,
  previousStatus: AppointmentStatus,
): Promise<SlotReopenResult> {
  if (!cancelledAppt.clinicId) return { triggered: false, reason: "no_clinic" };

  const autoNotifyEnabled = await getClinicAutoNotifySetting(cancelledAppt.clinicId);
  if (!autoNotifyEnabled) return { triggered: false, reason: "clinic_setting_off" };

  const eligible = isEligibleForSlotReopen({
    previousStatus,
    appointmentAt: cancelledAppt.appointmentAt,
    now: new Date(),
  });
  if (!eligible) return { triggered: false, reason: "not_eligible" };

  const slot = await createAvailableSlotFromCancelledAppointment(cancelledAppt);

  const candidates = await findNotifiablePatients(cancelledAppt.clinicId, cancelledAppt.patientId ?? null);
  const dryRun = !isEmailSendEnabled();
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

  let notifiedCount = 0;
  let skippedByRateLimit = 0;

  for (const patient of candidates) {
    // MVP: メールのみ対応。将来SMS/LINEを追加する場合はここでpatientの受信可能チャネルを見て分岐する
    if (!patient.email) continue;

    const recentCount = await countRecentNotifications(patient.id, since);
    if (!isWithinDailyNotifyLimit(recentCount)) { skippedByRateLimit++; continue; }

    const { id: notificationId, token } = await insertSlotNotification({
      availableSlotId: slot.id,
      clinicId: cancelledAppt.clinicId,
      patientId: patient.id,
      channel: "email",
      dryRun,
    });

    if (dryRun) {
      await markSlotNotificationSent(notificationId, { dryRun: true, sentAt: new Date().toISOString(), error: null });
      notifiedCount++;
      continue;
    }

    const unsubToken = await getPatientUnsubscribeToken(patient.id);
    const result = await sendAvailableSlotEmail({
      to: patient.email,
      clinicName: cancelledAppt.clinicName,
      appointmentAt: cancelledAppt.appointmentAt,
      claimUrl: `${baseUrl()}/slots/${token}`,
      unsubscribeUrl: `${baseUrl()}/patient/notifications/unsubscribe?token=${unsubToken}`,
    });
    if (result.ok) {
      await markSlotNotificationSent(notificationId, { dryRun: false, sentAt: new Date().toISOString(), error: null });
      notifiedCount++;
    } else {
      await markSlotNotificationSent(notificationId, { dryRun: false, sentAt: null, error: result.error });
    }
  }

  return { triggered: true, slotId: slot.id, notifiedCount, skippedByRateLimit };
}
