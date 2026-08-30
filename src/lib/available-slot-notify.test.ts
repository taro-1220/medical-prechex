// キャンセル→空き枠生成→通知対象抽出→レート制限→送信、のオーケストレーション検証。
// DB(available-slots-store)・メール送信(notify-email)は非純粋関数のためモックする。
// 判定ロジック本体は available-slot-policy.test.ts で別途検証済み。
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Appointment } from "./types";

const getClinicAutoNotifySettingMock = vi.fn();
const createAvailableSlotFromCancelledAppointmentMock = vi.fn();
const findNotifiablePatientsMock = vi.fn();
const countRecentNotificationsMock = vi.fn();
const insertSlotNotificationMock = vi.fn();
const markSlotNotificationSentMock = vi.fn();
const getPatientUnsubscribeTokenMock = vi.fn();

vi.mock("./available-slots-store", () => ({
  getClinicAutoNotifySetting: (...a: unknown[]) => getClinicAutoNotifySettingMock(...a),
  createAvailableSlotFromCancelledAppointment: (...a: unknown[]) => createAvailableSlotFromCancelledAppointmentMock(...a),
  findNotifiablePatients: (...a: unknown[]) => findNotifiablePatientsMock(...a),
  countRecentNotifications: (...a: unknown[]) => countRecentNotificationsMock(...a),
  insertSlotNotification: (...a: unknown[]) => insertSlotNotificationMock(...a),
  markSlotNotificationSent: (...a: unknown[]) => markSlotNotificationSentMock(...a),
  getPatientUnsubscribeToken: (...a: unknown[]) => getPatientUnsubscribeTokenMock(...a),
}));

let emailSendEnabled = false;
const sendAvailableSlotEmailMock = vi.fn();
vi.mock("./notify-email", () => ({
  isEmailSendEnabled: () => emailSendEnabled,
  sendAvailableSlotEmail: (...a: unknown[]) => sendAvailableSlotEmailMock(...a),
}));

const { handleAppointmentCancelledForSlotReopen } = await import("./available-slot-notify");

const CANCELLED_APPT: Appointment = {
  id: "appt-a", token: "tok-a", clinicName: "検収クリニック", patientName: "患者A",
  phone: "", email: "", communicationChannel: "manual",
  appointmentAt: "2099-01-01T06:00:00.000Z", description: "", cancellationPolicy: "",
  status: "cancelled", clinicId: "clinic-1", patientId: "patient-a",
  createdAt: "2026-01-01T00:00:00.000Z", treatmentCategory: "other",
  cancelPolicyApplied: false, baseAmount: null, cardRegistrationRequired: false,
  chargeStatus: "none", chargedAmount: null,
};

const SLOT = { id: "slot-1", clinicId: "clinic-1", sourceAppointmentId: "appt-a" };

beforeEach(() => {
  vi.clearAllMocks();
  emailSendEnabled = false;
  createAvailableSlotFromCancelledAppointmentMock.mockResolvedValue(SLOT);
  countRecentNotificationsMock.mockResolvedValue(0);
  insertSlotNotificationMock.mockResolvedValue({ id: "notif-1", token: "notif-token-1" });
});

describe("handleAppointmentCancelledForSlotReopen", () => {
  it("医院設定OFFなら何もしない（空き枠すら作らない）", async () => {
    getClinicAutoNotifySettingMock.mockResolvedValue(false);
    const result = await handleAppointmentCancelledForSlotReopen(CANCELLED_APPT, "confirmed");
    expect(result).toEqual({ triggered: false, reason: "clinic_setting_off" });
    expect(createAvailableSlotFromCancelledAppointmentMock).not.toHaveBeenCalled();
  });

  it("過去の予約なら再募集しない", async () => {
    getClinicAutoNotifySettingMock.mockResolvedValue(true);
    const pastAppt = { ...CANCELLED_APPT, appointmentAt: "2020-01-01T00:00:00.000Z" };
    const result = await handleAppointmentCancelledForSlotReopen(pastAppt, "confirmed");
    expect(result.triggered).toBe(false);
    expect(createAvailableSlotFromCancelledAppointmentMock).not.toHaveBeenCalled();
  });

  it("通知ON患者B・OFF患者Cのうち、Bのみへドライラン通知する（RESEND_API_KEY未設定）", async () => {
    getClinicAutoNotifySettingMock.mockResolvedValue(true);
    findNotifiablePatientsMock.mockResolvedValue([
      { id: "patient-b", name: "患者B", phone: "", email: "b@example.com" },
    ]);
    const result = await handleAppointmentCancelledForSlotReopen(CANCELLED_APPT, "confirmed");
    expect(result.triggered).toBe(true);
    expect(result.notifiedCount).toBe(1);
    expect(sendAvailableSlotEmailMock).not.toHaveBeenCalled(); // dry run
    expect(markSlotNotificationSentMock).toHaveBeenCalledWith("notif-1", expect.objectContaining({ dryRun: true }));
  });

  it("RESEND_API_KEY設定時は実際に送信を試みる", async () => {
    emailSendEnabled = true;
    getClinicAutoNotifySettingMock.mockResolvedValue(true);
    findNotifiablePatientsMock.mockResolvedValue([
      { id: "patient-b", name: "患者B", phone: "", email: "b@example.com" },
    ]);
    getPatientUnsubscribeTokenMock.mockResolvedValue("unsub-b");
    sendAvailableSlotEmailMock.mockResolvedValue({ ok: true });

    const result = await handleAppointmentCancelledForSlotReopen(CANCELLED_APPT, "confirmed");
    expect(result.notifiedCount).toBe(1);
    expect(sendAvailableSlotEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: "b@example.com",
      claimUrl: expect.stringContaining("/slots/notif-token-1"),
    }));
    // 元の予約患者A(患者名等)は一切送信ペイロードに含まれない
    const sentArg = sendAvailableSlotEmailMock.mock.calls[0][0];
    expect(JSON.stringify(sentArg)).not.toContain("患者A");
  });

  it("1日の通知上限に達した患者はスキップする", async () => {
    getClinicAutoNotifySettingMock.mockResolvedValue(true);
    findNotifiablePatientsMock.mockResolvedValue([
      { id: "patient-b", name: "患者B", phone: "", email: "b@example.com" },
    ]);
    countRecentNotificationsMock.mockResolvedValue(2); // 既に上限到達
    const result = await handleAppointmentCancelledForSlotReopen(CANCELLED_APPT, "confirmed");
    expect(result.notifiedCount).toBe(0);
    expect(result.skippedByRateLimit).toBe(1);
    expect(insertSlotNotificationMock).not.toHaveBeenCalled();
  });

  it("連絡先がメールのみで、メールが無い患者はスキップする", async () => {
    getClinicAutoNotifySettingMock.mockResolvedValue(true);
    findNotifiablePatientsMock.mockResolvedValue([
      { id: "patient-x", name: "患者X", phone: "090-0000-0000", email: "" },
    ]);
    const result = await handleAppointmentCancelledForSlotReopen(CANCELLED_APPT, "confirmed");
    expect(result.notifiedCount).toBe(0);
    expect(insertSlotNotificationMock).not.toHaveBeenCalled();
  });
});
