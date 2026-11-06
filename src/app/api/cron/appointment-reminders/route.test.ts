import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Appointment } from "@/lib/types";

const { fromMock, getAllAppointmentsMock, isEmailSendEnabledMock, sendAppointmentReminderEmailMock, reminderAlreadySentIdsMock, recordReminderSentMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getAllAppointmentsMock: vi.fn(),
  isEmailSendEnabledMock: vi.fn(),
  sendAppointmentReminderEmailMock: vi.fn(),
  reminderAlreadySentIdsMock: vi.fn(),
  recordReminderSentMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ from: fromMock }),
}));
vi.mock("@/lib/store", () => ({
  getAllAppointments: getAllAppointmentsMock,
}));
vi.mock("@/lib/notify-email", () => ({
  isEmailSendEnabled: isEmailSendEnabledMock,
  sendAppointmentReminderEmail: sendAppointmentReminderEmailMock,
}));
vi.mock("@/lib/reminder-store", () => ({
  reminderAlreadySentIds: reminderAlreadySentIdsMock,
  recordReminderSent: recordReminderSentMock,
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

const NOW = "2026-03-04T15:00:00.000Z"; // JST 2026-03-05、翌日=2026-03-06
const TOMORROW = "2026-03-06T01:00:00.000Z";

describe("GET /api/cron/appointment-reminders", () => {
  beforeEach(() => {
    fromMock.mockReset();
    getAllAppointmentsMock.mockReset();
    isEmailSendEnabledMock.mockReset();
    sendAppointmentReminderEmailMock.mockReset();
    reminderAlreadySentIdsMock.mockReset();
    recordReminderSentMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    delete process.env.CRON_SECRET;
    delete process.env.ENABLE_REMINDER_SEND;
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

  it("dry=1は送信せず件数のみ返す（個人情報を含まない）", async () => {
    process.env.CRON_SECRET = "correct";
    stubClinics();
    getAllAppointmentsMock.mockResolvedValue([makeAppt({ id: "1", appointmentAt: TOMORROW })]);
    reminderAlreadySentIdsMock.mockResolvedValue(new Set());

    const res = await GET(makeRequest("http://localhost/api/cron/appointment-reminders?dry=1", "Bearer correct"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ dryRun: true, targetCount: 1, clinicCount: 1 });
    expect(sendAppointmentReminderEmailMock).not.toHaveBeenCalled();
  });

  it("ENABLE_REMINDER_SEND未設定なら送信しない", async () => {
    process.env.CRON_SECRET = "correct";
    stubClinics();
    getAllAppointmentsMock.mockResolvedValue([makeAppt({ id: "1", appointmentAt: TOMORROW })]);
    reminderAlreadySentIdsMock.mockResolvedValue(new Set());
    isEmailSendEnabledMock.mockReturnValue(true);

    const res = await GET(makeRequest("http://localhost/api/cron/appointment-reminders", "Bearer correct"));
    const body = await res.json();
    expect(body).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(sendAppointmentReminderEmailMock).not.toHaveBeenCalled();
  });

  it("フラグONかつメール有効なら送信し、送信記録を保存する", async () => {
    process.env.CRON_SECRET = "correct";
    process.env.ENABLE_REMINDER_SEND = "true";
    stubClinics();
    getAllAppointmentsMock.mockResolvedValue([makeAppt({ id: "1", appointmentAt: TOMORROW, status: "confirmation_pending" })]);
    reminderAlreadySentIdsMock.mockResolvedValue(new Set());
    isEmailSendEnabledMock.mockReturnValue(true);
    sendAppointmentReminderEmailMock.mockResolvedValue({ ok: true });

    const res = await GET(makeRequest("http://localhost/api/cron/appointment-reminders", "Bearer correct"));
    const body = await res.json();
    expect(body).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(sendAppointmentReminderEmailMock).toHaveBeenCalledTimes(1);
    expect(recordReminderSentMock).toHaveBeenCalledWith("1");
  });

  it("送信失敗は件数に含め、他の対象には影響しない", async () => {
    process.env.CRON_SECRET = "correct";
    process.env.ENABLE_REMINDER_SEND = "true";
    stubClinics();
    getAllAppointmentsMock.mockResolvedValue([
      makeAppt({ id: "1", appointmentAt: TOMORROW }),
      makeAppt({ id: "2", appointmentAt: TOMORROW }),
    ]);
    reminderAlreadySentIdsMock.mockResolvedValue(new Set());
    isEmailSendEnabledMock.mockReturnValue(true);
    sendAppointmentReminderEmailMock
      .mockResolvedValueOnce({ ok: false, error: "resend_error_500" })
      .mockResolvedValueOnce({ ok: true });

    const res = await GET(makeRequest("http://localhost/api/cron/appointment-reminders", "Bearer correct"));
    const body = await res.json();
    expect(body).toEqual({ sent: 1, skipped: 0, failed: 1 });
  });

  it("送信済みの予約は対象から除外される（二重送信しない）", async () => {
    process.env.CRON_SECRET = "correct";
    process.env.ENABLE_REMINDER_SEND = "true";
    stubClinics();
    getAllAppointmentsMock.mockResolvedValue([makeAppt({ id: "1", appointmentAt: TOMORROW })]);
    reminderAlreadySentIdsMock.mockResolvedValue(new Set(["1"]));
    isEmailSendEnabledMock.mockReturnValue(true);

    const res = await GET(makeRequest("http://localhost/api/cron/appointment-reminders", "Bearer correct"));
    const body = await res.json();
    expect(body).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(sendAppointmentReminderEmailMock).not.toHaveBeenCalled();
  });
});
