import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getAppointmentMock, confirmWithConsentMock, isIdentityVerifiedMock } = vi.hoisted(() => ({
  getAppointmentMock: vi.fn(),
  confirmWithConsentMock: vi.fn(),
  isIdentityVerifiedMock: vi.fn(),
}));

vi.mock("@/lib/store", () => ({ getAppointment: getAppointmentMock, confirmWithConsent: confirmWithConsentMock }));
vi.mock("@/lib/identity-check", () => ({ isIdentityVerified: isIdentityVerifiedMock }));

import { POST } from "./route";

function makeAppt(overrides: Record<string, unknown> = {}) {
  return {
    id: "appt-1",
    token: "tok1",
    status: "confirmation_pending",
    appointmentAt: "2099-01-01T01:00:00.000Z",
    ...overrides,
  };
}

function makeRequest() {
  return new NextRequest("http://localhost/api/appointments/tok1/confirm", { method: "POST" });
}

function params() {
  return { params: Promise.resolve({ token: "tok1" }) };
}

describe("POST /api/appointments/[token]/confirm", () => {
  beforeEach(() => {
    getAppointmentMock.mockReset();
    confirmWithConsentMock.mockReset();
    isIdentityVerifiedMock.mockReset();
    isIdentityVerifiedMock.mockReturnValue(true);
  });

  for (const status of ["cancelled", "expired", "checked_in", "completed", "confirmed", "ticket_issued"]) {
    it(`status=${status}（upcoming_pending以外）は409で拒否し、DBに書き込まない`, async () => {
      getAppointmentMock.mockResolvedValue(makeAppt({ status }));
      const res = await POST(makeRequest(), params());
      expect(res.status).toBe(409);
      expect(confirmWithConsentMock).not.toHaveBeenCalled();
    });
  }

  it("予約日時を過ぎたconfirmation_pending（past_pending）は409で拒否", async () => {
    getAppointmentMock.mockResolvedValue(makeAppt({ appointmentAt: "2020-01-01T01:00:00.000Z" }));
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(409);
    expect(confirmWithConsentMock).not.toHaveBeenCalled();
  });

  it("upcoming_pendingなら confirmWithConsent を呼ぶ", async () => {
    getAppointmentMock.mockResolvedValue(makeAppt());
    confirmWithConsentMock.mockResolvedValue(true);
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(200);
    expect(confirmWithConsentMock).toHaveBeenCalledWith("tok1");
  });
});
