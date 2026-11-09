import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  getAppointmentMock,
  isIdentityCheckLockedMock,
  recordIdentityCheckFailureMock,
  resetIdentityCheckFailuresMock,
  issueIdentityCookieValueMock,
  cookieNameForMock,
  isNameMatchMock,
  isPhoneLast4MatchMock,
} = vi.hoisted(() => ({
  getAppointmentMock: vi.fn(),
  isIdentityCheckLockedMock: vi.fn(),
  recordIdentityCheckFailureMock: vi.fn(),
  resetIdentityCheckFailuresMock: vi.fn(),
  issueIdentityCookieValueMock: vi.fn(),
  cookieNameForMock: vi.fn(),
  isNameMatchMock: vi.fn(),
  isPhoneLast4MatchMock: vi.fn(),
}));

vi.mock("@/lib/store", () => ({ getAppointment: getAppointmentMock }));
vi.mock("@/lib/identity-check-store", () => ({
  isIdentityCheckLocked: isIdentityCheckLockedMock,
  recordIdentityCheckFailure: recordIdentityCheckFailureMock,
  resetIdentityCheckFailures: resetIdentityCheckFailuresMock,
}));
vi.mock("@/lib/identity-check", () => ({
  issueIdentityCookieValue: issueIdentityCookieValueMock,
  cookieNameFor: cookieNameForMock,
  isNameMatch: isNameMatchMock,
  isPhoneLast4Match: isPhoneLast4MatchMock,
  COOKIE_MAX_AGE_SEC: 900,
}));

import { POST } from "./route";

function makeAppt(overrides: Record<string, unknown> = {}) {
  return {
    id: "appt-1",
    token: "tok1",
    phone: "09012345678",
    patientName: "テスト患者",
    status: "confirmation_pending",
    appointmentAt: "2099-01-01T01:00:00.000Z",
    ...overrides,
  };
}

function makeRequest(body: unknown = { answer: "5678" }) {
  return new NextRequest("http://localhost/api/appointments/tok1/verify-identity", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ token: "tok1" }) };
}

describe("POST /api/appointments/[token]/verify-identity", () => {
  beforeEach(() => {
    process.env.SITE_ACCESS_COOKIE_SECRET = "secret";
    getAppointmentMock.mockReset();
    isIdentityCheckLockedMock.mockReset();
    recordIdentityCheckFailureMock.mockReset();
    resetIdentityCheckFailuresMock.mockReset();
    issueIdentityCookieValueMock.mockReset();
    cookieNameForMock.mockReset();
    isNameMatchMock.mockReset();
    isPhoneLast4MatchMock.mockReset();
    isIdentityCheckLockedMock.mockResolvedValue(false);
    cookieNameForMock.mockReturnValue("identity_tok1");
    issueIdentityCookieValueMock.mockReturnValue("cookie-value");
  });

  for (const status of ["cancelled", "expired", "checked_in", "completed", "confirmed", "ticket_issued"]) {
    it(`status=${status}（upcoming_pending以外）は409で拒否し、照合も失敗記録もしない`, async () => {
      getAppointmentMock.mockResolvedValue(makeAppt({ status }));
      const res = await POST(makeRequest(), params());
      expect(res.status).toBe(409);
      expect(isPhoneLast4MatchMock).not.toHaveBeenCalled();
      expect(recordIdentityCheckFailureMock).not.toHaveBeenCalled();
    });
  }

  it("予約日時を過ぎたconfirmation_pending（past_pending）は409で拒否", async () => {
    getAppointmentMock.mockResolvedValue(makeAppt({ appointmentAt: "2020-01-01T01:00:00.000Z" }));
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(409);
    expect(isPhoneLast4MatchMock).not.toHaveBeenCalled();
  });

  it("upcoming_pendingなら照合処理を行う", async () => {
    getAppointmentMock.mockResolvedValue(makeAppt());
    isPhoneLast4MatchMock.mockReturnValue(true);
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(200);
    expect(isPhoneLast4MatchMock).toHaveBeenCalled();
  });
});
