import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Appointment } from "./types";

const { fromMock, sendConfirmationRequestEmailMock, isEmailSendEnabledMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  sendConfirmationRequestEmailMock: vi.fn(),
  isEmailSendEnabledMock: vi.fn(),
}));

vi.mock("./supabase", () => ({ getSupabase: () => ({ from: fromMock }) }));
vi.mock("./notify-email", () => ({
  sendConfirmationRequestEmail: sendConfirmationRequestEmailMock,
  isEmailSendEnabled: isEmailSendEnabledMock,
}));

import { sendConfirmationEmailAndRecord } from "./confirm-email";

function makeAppt(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "appt-1",
    token: "tok1",
    clinicName: "テスト医院",
    patientName: "山田太郎",
    phone: "",
    email: "patient@example.com",
    communicationChannel: "manual",
    appointmentAt: "2026-03-05T01:00:00.000Z",
    description: "",
    cancellationPolicy: "",
    status: "confirmation_pending",
    clinicId: "clinic-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    treatmentCategory: "other",
    cancelPolicyApplied: false,
    baseAmount: null,
    cardRegistrationRequired: false,
    chargeStatus: "none",
    chargedAmount: null,
    ...overrides,
  };
}

const updateCalls: unknown[] = [];

function stub() {
  fromMock.mockImplementation((table: string) => {
    if (table === "clinics") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { phone: "03-0000-0000" }, error: null }) }) }) };
    }
    if (table === "appointments") {
      return {
        update: (payload: unknown) => {
          updateCalls.push(payload);
          return { eq: async () => ({ error: null }) };
        },
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
}

describe("sendConfirmationEmailAndRecord", () => {
  beforeEach(() => {
    fromMock.mockReset();
    sendConfirmationRequestEmailMock.mockReset();
    isEmailSendEnabledMock.mockReset();
    updateCalls.length = 0;
    delete process.env.ENABLE_REMINDER_SEND;
    stub();
  });

  it("メールが無ければ送らない(no_email)", async () => {
    const res = await sendConfirmationEmailAndRecord(makeAppt({ email: "" }));
    expect(res).toEqual({ ok: false, reason: "no_email" });
    expect(sendConfirmationRequestEmailMock).not.toHaveBeenCalled();
  });

  it("ENABLE_REMINDER_SEND未設定なら送らない(disabled)", async () => {
    isEmailSendEnabledMock.mockReturnValue(true);
    const res = await sendConfirmationEmailAndRecord(makeAppt());
    expect(res).toEqual({ ok: false, reason: "disabled" });
    expect(sendConfirmationRequestEmailMock).not.toHaveBeenCalled();
  });

  it("キャンセル済み・期限切れには送らない(invalid_status)", async () => {
    process.env.ENABLE_REMINDER_SEND = "true";
    isEmailSendEnabledMock.mockReturnValue(true);
    expect(await sendConfirmationEmailAndRecord(makeAppt({ status: "cancelled" }))).toEqual({ ok: false, reason: "invalid_status" });
    expect(await sendConfirmationEmailAndRecord(makeAppt({ status: "expired" }))).toEqual({ ok: false, reason: "invalid_status" });
    expect(sendConfirmationRequestEmailMock).not.toHaveBeenCalled();
  });

  it("送信成功でemail_sent_atを更新する", async () => {
    process.env.ENABLE_REMINDER_SEND = "true";
    isEmailSendEnabledMock.mockReturnValue(true);
    sendConfirmationRequestEmailMock.mockResolvedValue({ ok: true });
    const res = await sendConfirmationEmailAndRecord(makeAppt());
    expect(res.ok).toBe(true);
    expect(updateCalls[0]).toMatchObject({ email_sent_at: expect.any(String) });
  });

  it("送信失敗でも例外を投げず、記録も更新しない(send_failed)", async () => {
    process.env.ENABLE_REMINDER_SEND = "true";
    isEmailSendEnabledMock.mockReturnValue(true);
    sendConfirmationRequestEmailMock.mockResolvedValue({ ok: false, error: "resend_error_500" });
    const res = await sendConfirmationEmailAndRecord(makeAppt());
    expect(res).toEqual({ ok: false, reason: "send_failed" });
    expect(updateCalls.length).toBe(0);
  });
});
