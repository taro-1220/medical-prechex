import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Appointment } from "@/lib/types";

const { fromMock, getAllAppointmentsMock, getAppointmentByIdMock, isEmailSendEnabledMock, sendAppointmentReminderEmailMock, reminderAlreadySentIdsMock, recordReminderSentMock, recordNotificationRunMock, setEmailLastFailedAtMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getAllAppointmentsMock: vi.fn(),
  getAppointmentByIdMock: vi.fn(),
  isEmailSendEnabledMock: vi.fn(),
  sendAppointmentReminderEmailMock: vi.fn(),
  reminderAlreadySentIdsMock: vi.fn(),
  recordReminderSentMock: vi.fn(),
  recordNotificationRunMock: vi.fn(),
  setEmailLastFailedAtMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ from: fromMock }),
}));
vi.mock("@/lib/store", () => ({
  getAllAppointments: getAllAppointmentsMock,
  getAppointmentById: getAppointmentByIdMock,
}));
vi.mock("@/lib/notify-email", () => ({
  isEmailSendEnabled: isEmailSendEnabledMock,
  sendAppointmentReminderEmail: sendAppointmentReminderEmailMock,
}));
vi.mock("@/lib/reminder-store", () => ({
  reminderAlreadySentIds: reminderAlreadySentIdsMock,
  recordReminderSent: recordReminderSentMock,
  REMINDER_NOTIFICATION_TYPE: { threeDaysBefore: "reminder_three_days_before", dayBefore: "reminder_day_before" },
}));
vi.mock("@/lib/notification-run-store", () => ({
  recordNotificationRun: recordNotificationRunMock,
  setEmailLastFailedAt: setEmailLastFailedAtMock,
}));

import { GET } from "./route";

function makeAppt(overrides: Partial<Appointment> & { appointmentAt: string }): Appointment {
  return {
    id: overrides.id ?? "a1",
    token: "tok1",
    clinicName: "テスト医院",
    patientName: "山田太郎",
    phone: "",
    email: "patient@example.com",
    communicationChannel: "manual",
    description: "",
    cancellationPolicy: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    treatmentCategory: "other",
    cancelPolicyApplied: false,
    baseAmount: null,
    cardRegistrationRequired: false,
    chargeStatus: "none",
    chargedAmount: null,
    status: "confirmed",
    clinicId: "clinic-1",
    ...overrides,
  };
}

function makeRequest(url: string, authHeader?: string) {
  return new NextRequest(url, { headers: authHeader ? { authorization: authHeader } : undefined });
}

function stubClinics() {
  fromMock.mockImplementation((table: string) => {
    if (table === "clinics") {
      return { select: () => Promise.resolve({ data: [{ id: "clinic-1", name: "テスト医院", phone: "03-0000-0000" }], error: null }) };
    }
    throw new Error(`unexpected table: ${table}`);
  });
}

const NOW = "2026-03-04T15:00:00.000Z"; // JST 2026-03-05、翌日=2026-03-06、3日後=2026-03-08
const TOMORROW = "2026-03-06T01:00:00.000Z";
const THREE_DAYS_AHEAD = "2026-03-08T01:00:00.000Z";

describe("GET /api/cron/appointment-reminders", () => {
  beforeEach(() => {
    fromMock.mockReset();
    getAllAppointmentsMock.mockReset();
    getAppointmentByIdMock.mockReset();
    isEmailSendEnabledMock.mockReset();
    sendAppointmentReminderEmailMock.mockReset();
    reminderAlreadySentIdsMock.mockReset();
    recordReminderSentMock.mockReset();
    recordNotificationRunMock.mockReset();
    setEmailLastFailedAtMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    delete process.env.CRON_SECRET;
    delete process.env.ENABLE_REMINDER_SEND;
    reminderAlreadySentIdsMock.mockResolvedValue(new Set());
    sendAppointmentReminderEmailMock.mockResolvedValue({ ok: true });
    // 既定: 再取得した予約は対象抽出時のまま変わっていない
    getAppointmentByIdMock.mockImplementation(async (id: string) => makeAppt({ id, appointmentAt: TOMORROW }));
  });

  it("CRON_SECRET未設定なら401", async () => {
    const res = await GET(makeRequest("http://localhost/api/cron/appointment-reminders", "Bearer anything"));
    expect(res.status).toBe(401);
  });

  it("CRON_SECRETと不一致なら401", async () => {
    process.env.CRON_SECRET = "correct";
    const res = await GET(makeRequest("http://localhost/api/cron/appointment-reminders", "Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("dry=1は送信せず、3日前・前日それぞれの件数と合計を返す（個人情報を含まない）", async () => {
    process.env.CRON_SECRET = "correct";
    stubClinics();
    getAllAppointmentsMock.mockResolvedValue([
      makeAppt({ id: "1", appointmentAt: TOMORROW }),
      makeAppt({ id: "2", appointmentAt: THREE_DAYS_AHEAD, createdAt: "2026-03-01T00:00:00.000Z" }),
    ]);

    const res = await GET(makeRequest("http://localhost/api/cron/appointment-reminders?dry=1", "Bearer correct"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ dryRun: true, targetCount: 2, threeDaysBeforeCount: 1, dayBeforeCount: 1, clinicCount: 1 });
    expect(sendAppointmentReminderEmailMock).not.toHaveBeenCalled();
  });

  it("ENABLE_REMINDER_SEND未設定なら送信しない", async () => {
    process.env.CRON_SECRET = "correct";
    stubClinics();
    getAllAppointmentsMock.mockResolvedValue([makeAppt({ id: "1", appointmentAt: TOMORROW })]);
    isEmailSendEnabledMock.mockReturnValue(true);

    const res = await GET(makeRequest("http://localhost/api/cron/appointment-reminders", "Bearer correct"));
    const body = await res.json();
    expect(body).toEqual({ sent: 0, skipped: 1, failed: 0, capped: 0 });
    expect(sendAppointmentReminderEmailMock).not.toHaveBeenCalled();
  });

  it("フラグONかつメール有効なら送信し、種別ごとに送信記録を保存する", async () => {
    process.env.CRON_SECRET = "correct";
    process.env.ENABLE_REMINDER_SEND = "true";
    stubClinics();
    getAllAppointmentsMock.mockResolvedValue([
      makeAppt({ id: "1", appointmentAt: TOMORROW, status: "confirmation_pending" }),
      makeAppt({ id: "2", appointmentAt: THREE_DAYS_AHEAD, createdAt: "2026-03-01T00:00:00.000Z" }),
    ]);
    getAppointmentByIdMock.mockImplementation(async (id: string) =>
      id === "2"
        ? makeAppt({ id, appointmentAt: THREE_DAYS_AHEAD, createdAt: "2026-03-01T00:00:00.000Z" })
        : makeAppt({ id, appointmentAt: TOMORROW, status: "confirmation_pending" }),
    );
    isEmailSendEnabledMock.mockReturnValue(true);

    const res = await GET(makeRequest("http://localhost/api/cron/appointment-reminders", "Bearer correct"));
    const body = await res.json();
    expect(body).toEqual({ sent: 2, skipped: 0, failed: 0, capped: 0 });
    expect(sendAppointmentReminderEmailMock).toHaveBeenCalledTimes(2);
    expect(sendAppointmentReminderEmailMock).toHaveBeenCalledWith(expect.objectContaining({ daysBefore: 3 }));
    expect(sendAppointmentReminderEmailMock).toHaveBeenCalledWith(expect.objectContaining({ daysBefore: 1 }));
    expect(recordReminderSentMock).toHaveBeenCalledWith("1", "reminder_day_before");
    expect(recordReminderSentMock).toHaveBeenCalledWith("2", "reminder_three_days_before");
    expect(recordNotificationRunMock).toHaveBeenCalledTimes(2);
  });

  it("送信失敗は件数に含め、他の対象には影響しない", async () => {
    process.env.CRON_SECRET = "correct";
    process.env.ENABLE_REMINDER_SEND = "true";
    stubClinics();
    getAllAppointmentsMock.mockResolvedValue([
      makeAppt({ id: "1", appointmentAt: TOMORROW }),
      makeAppt({ id: "2", appointmentAt: TOMORROW }),
    ]);
    isEmailSendEnabledMock.mockReturnValue(true);
    sendAppointmentReminderEmailMock
      .mockResolvedValueOnce({ ok: false, error: "resend_error_500" })
      .mockResolvedValueOnce({ ok: true });

    const res = await GET(makeRequest("http://localhost/api/cron/appointment-reminders", "Bearer correct"));
    const body = await res.json();
    expect(body).toEqual({ sent: 1, skipped: 0, failed: 1, capped: 0 });
  });

  it("送信済みの予約は、その種別のみ対象から除外される（二重送信しない）", async () => {
    process.env.CRON_SECRET = "correct";
    process.env.ENABLE_REMINDER_SEND = "true";
    stubClinics();
    getAllAppointmentsMock.mockResolvedValue([
      makeAppt({ id: "1", appointmentAt: TOMORROW }),
      makeAppt({ id: "2", appointmentAt: THREE_DAYS_AHEAD, createdAt: "2026-03-01T00:00:00.000Z" }),
    ]);
    reminderAlreadySentIdsMock.mockImplementation(async (_ids: string[], type: string) =>
      type === "reminder_day_before" ? new Set(["1"]) : new Set(["2"]),
    );
    isEmailSendEnabledMock.mockReturnValue(true);

    const res = await GET(makeRequest("http://localhost/api/cron/appointment-reminders", "Bearer correct"));
    const body = await res.json();
    expect(body).toEqual({ sent: 0, skipped: 0, failed: 0, capped: 0 });
    expect(sendAppointmentReminderEmailMock).not.toHaveBeenCalled();
  });

  it("送信直前の再取得でキャンセル済みに変わっていればスキップする", async () => {
    process.env.CRON_SECRET = "correct";
    process.env.ENABLE_REMINDER_SEND = "true";
    stubClinics();
    getAllAppointmentsMock.mockResolvedValue([makeAppt({ id: "1", appointmentAt: TOMORROW })]);
    isEmailSendEnabledMock.mockReturnValue(true);
    getAppointmentByIdMock.mockResolvedValue(makeAppt({ id: "1", appointmentAt: TOMORROW, status: "cancelled" }));

    const res = await GET(makeRequest("http://localhost/api/cron/appointment-reminders", "Bearer correct"));
    const body = await res.json();
    expect(body).toEqual({ sent: 0, skipped: 1, failed: 0, capped: 0 });
    expect(sendAppointmentReminderEmailMock).not.toHaveBeenCalled();
  });

  it("送信直前の再取得で日時が変わっていればスキップする", async () => {
    process.env.CRON_SECRET = "correct";
    process.env.ENABLE_REMINDER_SEND = "true";
    stubClinics();
    getAllAppointmentsMock.mockResolvedValue([makeAppt({ id: "1", appointmentAt: TOMORROW })]);
    isEmailSendEnabledMock.mockReturnValue(true);
    getAppointmentByIdMock.mockResolvedValue(makeAppt({ id: "1", appointmentAt: "2026-03-07T01:00:00.000Z" }));

    const res = await GET(makeRequest("http://localhost/api/cron/appointment-reminders", "Bearer correct"));
    const body = await res.json();
    expect(body).toEqual({ sent: 0, skipped: 1, failed: 0, capped: 0 });
    expect(sendAppointmentReminderEmailMock).not.toHaveBeenCalled();
  });

  it("1クリニックの上限（100件）を超えた分は送らず、他クリニックは継続する（2種別合算）", async () => {
    process.env.CRON_SECRET = "correct";
    process.env.ENABLE_REMINDER_SEND = "true";
    fromMock.mockImplementation((table: string) => {
      if (table === "clinics") {
        return {
          select: () => Promise.resolve({
            data: [
              { id: "clinic-1", name: "医院A", phone: "" },
              { id: "clinic-2", name: "医院B", phone: "" },
            ],
            error: null,
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    });
    const clinicAAppts = Array.from({ length: 101 }, (_, i) => makeAppt({ id: `a${i}`, appointmentAt: TOMORROW, clinicId: "clinic-1" }));
    const clinicBAppt = makeAppt({ id: "b0", appointmentAt: TOMORROW, clinicId: "clinic-2" });
    getAllAppointmentsMock.mockResolvedValue([...clinicAAppts, clinicBAppt]);
    isEmailSendEnabledMock.mockReturnValue(true);
    getAppointmentByIdMock.mockImplementation(async (id: string) => makeAppt({ id, appointmentAt: TOMORROW }));

    const res = await GET(makeRequest("http://localhost/api/cron/appointment-reminders", "Bearer correct"));
    const body = await res.json();
    expect(body.sent).toBe(101); // クリニックA 100件 + クリニックB 1件
    expect(body.capped).toBe(1); // クリニックAの101件目
  });
});
