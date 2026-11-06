import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getAppointmentMock, savePatientRegisteredEmailMock, isEmailSendEnabledMock, sendEmailRegisteredNoticeMock } = vi.hoisted(() => ({
  getAppointmentMock: vi.fn(),
  savePatientRegisteredEmailMock: vi.fn(),
  isEmailSendEnabledMock: vi.fn(),
  sendEmailRegisteredNoticeMock: vi.fn(),
}));

vi.mock("@/lib/store", () => ({ getAppointment: getAppointmentMock }));
vi.mock("@/lib/patient-email-store", () => ({ savePatientRegisteredEmail: savePatientRegisteredEmailMock }));
vi.mock("@/lib/notify-email", () => ({
  isEmailSendEnabled: isEmailSendEnabledMock,
  sendEmailRegisteredNotice: sendEmailRegisteredNoticeMock,
}));

import { POST } from "./route";

function makeAppt(overrides: Record<string, unknown> = {}) {
  return {
    id: "appt-1",
    token: "tok1",
    clinicName: "テスト医院",
    status: "confirmed",
    appointmentAt: "2026-03-05T01:00:00.000Z",
    ...overrides,
  };
}

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/appointments/tok1/register-email", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ token: "tok1" }) };
}

describe("POST /api/appointments/[token]/register-email", () => {
  beforeEach(() => {
    getAppointmentMock.mockReset();
    savePatientRegisteredEmailMock.mockReset();
    isEmailSendEnabledMock.mockReset();
    sendEmailRegisteredNoticeMock.mockReset();
    delete process.env.ENABLE_REMINDER_SEND;
  });

  it("存在しない予約（不正トークン）は404", async () => {
    getAppointmentMock.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ email: "a@example.com" }), params());
    expect(res.status).toBe(404);
  });

  for (const status of ["cancelled", "expired", "checked_in", "completed"]) {
    it(`status=${status}は409で拒否`, async () => {
      getAppointmentMock.mockResolvedValue(makeAppt({ status }));
      const res = await POST(makeRequest({ email: "a@example.com" }), params());
      expect(res.status).toBe(409);
      expect(savePatientRegisteredEmailMock).not.toHaveBeenCalled();
    });
  }

  it("不正な形式のメールは400", async () => {
    getAppointmentMock.mockResolvedValue(makeAppt());
    const res = await POST(makeRequest({ email: "not-an-email" }), params());
    expect(res.status).toBe(400);
    expect(savePatientRegisteredEmailMock).not.toHaveBeenCalled();
  });

  it("回数制限（直前の保存から短時間）は429", async () => {
    getAppointmentMock.mockResolvedValue(makeAppt());
    savePatientRegisteredEmailMock.mockResolvedValue({ ok: false, reason: "rate_limited" });
    const res = await POST(makeRequest({ email: "a@example.com" }), params());
    expect(res.status).toBe(429);
  });

  it("migration 024未適用（unsupported）は503で安全に応答する", async () => {
    getAppointmentMock.mockResolvedValue(makeAppt());
    savePatientRegisteredEmailMock.mockResolvedValue({ ok: false, reason: "unsupported" });
    const res = await POST(makeRequest({ email: "a@example.com" }), params());
    expect(res.status).toBe(503);
  });

  it("成功時、ENABLE_REMINDER_SEND=trueなら受付完了メールを送る", async () => {
    process.env.ENABLE_REMINDER_SEND = "true";
    getAppointmentMock.mockResolvedValue(makeAppt());
    savePatientRegisteredEmailMock.mockResolvedValue({ ok: true });
    isEmailSendEnabledMock.mockReturnValue(true);
    sendEmailRegisteredNoticeMock.mockResolvedValue({ ok: true });
    const res = await POST(makeRequest({ email: "a@example.com" }), params());
    expect(res.status).toBe(200);
    expect(sendEmailRegisteredNoticeMock).toHaveBeenCalledTimes(1);
  });

  it("ENABLE_REMINDER_SEND未設定なら受付完了メールは送らない", async () => {
    getAppointmentMock.mockResolvedValue(makeAppt());
    savePatientRegisteredEmailMock.mockResolvedValue({ ok: true });
    const res = await POST(makeRequest({ email: "a@example.com" }), params());
    expect(res.status).toBe(200);
    expect(sendEmailRegisteredNoticeMock).not.toHaveBeenCalled();
  });

  it("空文字は登録解除として扱い、メール送信もしない", async () => {
    process.env.ENABLE_REMINDER_SEND = "true";
    getAppointmentMock.mockResolvedValue(makeAppt());
    savePatientRegisteredEmailMock.mockResolvedValue({ ok: true });
    const res = await POST(makeRequest({ email: "" }), params());
    expect(res.status).toBe(200);
    expect(savePatientRegisteredEmailMock).toHaveBeenCalledWith("appt-1", null);
    expect(sendEmailRegisteredNoticeMock).not.toHaveBeenCalled();
  });
});
