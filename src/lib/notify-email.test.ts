import { describe, it, expect, vi, afterEach } from "vitest";
import { buildAvailableSlotEmail, isEmailSendEnabled, sendAvailableSlotEmail, buildClinicApprovedEmail, sendClinicApprovedEmail } from "./notify-email";

const BASE_INPUT = {
  to: "patient-b@example.com",
  clinicName: "検収クリニック",
  appointmentAt: "2026-08-29T06:30:00Z", // 15:30 JST
  claimUrl: "http://localhost:3000/slots/tok-abc",
  unsubscribeUrl: "http://localhost:3000/api/patient/notifications/unsubscribe?token=unsub-abc",
};

describe("buildAvailableSlotEmail", () => {
  it("件名・本文・URLを含む", () => {
    const payload = buildAvailableSlotEmail(BASE_INPUT);
    expect(payload.to).toBe(BASE_INPUT.to);
    expect(payload.subject).toBe("本日予約可能な枠が空きました");
    expect(payload.text).toContain(BASE_INPUT.clinicName);
    expect(payload.text).toContain(BASE_INPUT.claimUrl);
    expect(payload.text).toContain(BASE_INPUT.unsubscribeUrl);
    expect(payload.text).toContain("先着順");
  });

  it("元の予約患者の個人情報を含む余地がない（関数の引数にそもそも存在しない）", () => {
    const payload = buildAvailableSlotEmail(BASE_INPUT);
    // 呼び出し元が渡せるのは to/clinicName/appointmentAt/claimUrl/unsubscribeUrl のみ。
    // 患者名・診療内容・キャンセル理由に相当する語が本文に含まれないことを確認する。
    expect(payload.text).not.toMatch(/様$/m);
    expect(payload.text).not.toContain("キャンセル理由");
  });
});

describe("isEmailSendEnabled", () => {
  const original = process.env.RESEND_API_KEY;
  afterEach(() => { process.env.RESEND_API_KEY = original; });

  it("RESEND_API_KEY未設定ならfalse", () => {
    delete process.env.RESEND_API_KEY;
    expect(isEmailSendEnabled()).toBe(false);
  });

  it("RESEND_API_KEY設定済みならtrue", () => {
    process.env.RESEND_API_KEY = "re_test_dummy";
    expect(isEmailSendEnabled()).toBe(true);
  });
});

describe("sendAvailableSlotEmail", () => {
  const originalKey = process.env.RESEND_API_KEY;
  afterEach(() => {
    process.env.RESEND_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("Resend APIが200を返せばok:trueを返す", async () => {
    process.env.RESEND_API_KEY = "re_test_dummy";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendAvailableSlotEmail(BASE_INPUT);
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("Resend APIがエラーを返せばok:falseを返す（例外を投げない）", async () => {
    process.env.RESEND_API_KEY = "re_test_dummy";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422 }));
    const result = await sendAvailableSlotEmail(BASE_INPUT);
    expect(result).toEqual({ ok: false, error: "resend_error_422" });
  });

  it("ネットワーク例外もok:falseとして返す（例外を投げない）", async () => {
    process.env.RESEND_API_KEY = "re_test_dummy";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await sendAvailableSlotEmail(BASE_INPUT);
    expect(result).toEqual({ ok: false, error: "network down" });
  });
});

describe("buildClinicApprovedEmail / sendClinicApprovedEmail: Phase P1 承認完了通知", () => {
  const APPROVED_INPUT = {
    to: "clinic-owner@example.com",
    clinicName: "検収クリニック",
    loginUrl: "http://localhost:3000/clinic",
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("件名・医院名・ログインURLを含む", () => {
    const payload = buildClinicApprovedEmail(APPROVED_INPUT);
    expect(payload.to).toBe(APPROVED_INPUT.to);
    expect(payload.subject).toContain("承認");
    expect(payload.text).toContain(APPROVED_INPUT.clinicName);
    expect(payload.text).toContain(APPROVED_INPUT.loginUrl);
  });

  it("既存の空き枠通知と同じResend送信基盤(sendEmailViaResend)を使う", async () => {
    process.env.RESEND_API_KEY = "re_test_dummy";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendClinicApprovedEmail(APPROVED_INPUT);
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
