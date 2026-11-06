import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildAvailableSlotEmail, isEmailSendEnabled, sendAvailableSlotEmail, buildClinicApprovedEmail, sendClinicApprovedEmail,
  buildAppointmentReminderEmail, buildConfirmationRequestEmail, buildEmailRegisteredNotice,
} from "./notify-email";

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

describe("患者向け自動送信3種（前日リマインド・確認URL・メール登録完了）の末尾案内・宛名", () => {
  const PATIENT_NAME = "山田太郎";
  const CASES = [
    { name: "reminder", build: () => buildAppointmentReminderEmail({ to: "p@example.com", clinicName: "検収クリニック", clinicPhone: "03-1111-2222", appointmentAt: "2026-08-29T06:30:00Z", confirmUrl: null }) },
    { name: "confirmation-request", build: () => buildConfirmationRequestEmail({ to: "p@example.com", clinicName: "検収クリニック", clinicPhone: "03-1111-2222", appointmentAt: "2026-08-29T06:30:00Z", confirmUrl: "http://localhost:3000/confirm/tok1" }) },
    { name: "email-registered-notice", build: () => buildEmailRegisteredNotice({ to: "p@example.com", clinicName: "検収クリニック", clinicPhone: "03-1111-2222", appointmentAt: "2026-08-29T06:30:00Z" }) },
  ];

  for (const { name, build } of CASES) {
    it(`${name}: 宛名は「ご予約者様」で、患者氏名は本文に含まれない`, () => {
      const payload = build();
      expect(payload.text).toContain("ご予約者様");
      expect(payload.text).not.toContain(PATIENT_NAME);
    });

    it(`${name}: 末尾に心当たりが無い場合の連絡先と、お知らせ不要の申し出先がある`, () => {
      const payload = build();
      expect(payload.text).toContain("心当たりがない場合は");
      expect(payload.text).toContain("検収クリニック（03-1111-2222）");
      expect(payload.text).toContain("お知らせが不要な場合は、検収クリニックにお申し出ください。");
    });
  }

  it("電話番号が無いクリニックは、末尾の連絡先表記から電話部分を省く", () => {
    const payload = buildAppointmentReminderEmail({ to: "p@example.com", clinicName: "検収クリニック", clinicPhone: "", appointmentAt: "2026-08-29T06:30:00Z", confirmUrl: null });
    expect(payload.text).toContain("心当たりがない場合は、お手数ですが破棄のうえ、検収クリニックまでご連絡ください。");
    expect(payload.text).not.toContain("検収クリニック（）");
  });
});
