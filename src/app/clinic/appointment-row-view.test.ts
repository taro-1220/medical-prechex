import { describe, it, expect } from "vitest";
import type { Appointment } from "@/lib/types";
import { STATUS_LABEL, attentionReasons, confirmProgress } from "./appointment-row-view";

function makeAppt(overrides: Partial<Appointment> & { appointmentAt: string }): Appointment {
  return {
    id: overrides.id ?? "a1",
    token: overrides.token ?? "tok1",
    clinicName: "テスト医院",
    patientName: "山田太郎",
    phone: "",
    email: "",
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

const NOW = "2026-03-05T00:00:00.000Z";
const FUTURE = "2026-03-10T00:00:00.000Z";
const PAST = "2026-03-01T00:00:00.000Z";

describe("STATUS_LABEL", () => {
  it("confirmation_pendingは「同意待ち」", () => {
    expect(STATUS_LABEL.confirmation_pending).toBe("同意待ち");
  });
});

describe("attentionReasons", () => {
  it("期限切れ（未同意かつ予約時刻を過ぎた）は要対応に出さない", () => {
    const a = makeAppt({ status: "confirmation_pending", appointmentAt: PAST, cardRegistrationRequired: true, chargeStatus: "failed" });
    expect(attentionReasons(a, NOW)).toEqual([]);
  });

  it("カード未登録: 登録必須・未登録・キャンセル/完了でない・未来の予約ならカード未登録を出す", () => {
    const a = makeAppt({ status: "confirmed", appointmentAt: FUTURE, cardRegistrationRequired: true, stripePaymentMethodId: undefined });
    expect(attentionReasons(a, NOW)).toEqual(["カード未登録"]);
  });

  it("クリニックのStripeがactiveでなければカード未登録を出さない", () => {
    const a = makeAppt({ status: "confirmed", appointmentAt: FUTURE, cardRegistrationRequired: true });
    expect(attentionReasons(a, NOW, "not_connected")).toEqual([]);
    expect(attentionReasons(a, NOW, "pending")).toEqual([]);
    expect(attentionReasons(a, NOW, null)).toEqual([]);
  });

  it("stripeAccountStatusを渡さない呼び出し元は既存どおりカード未登録を出す", () => {
    const a = makeAppt({ status: "confirmed", appointmentAt: FUTURE, cardRegistrationRequired: true });
    expect(attentionReasons(a, NOW)).toEqual(["カード未登録"]);
  });

  it("キャンセル済み・完了済みはカード未登録を出さない", () => {
    const cancelled = makeAppt({ status: "cancelled", appointmentAt: FUTURE, cardRegistrationRequired: true });
    const completed = makeAppt({ status: "completed", appointmentAt: PAST, cardRegistrationRequired: true });
    expect(attentionReasons(cancelled, NOW)).toEqual([]);
    expect(attentionReasons(completed, NOW)).toEqual([]);
  });

  it("請求失敗・要再認証は従来どおり出す", () => {
    expect(attentionReasons(makeAppt({ appointmentAt: FUTURE, chargeStatus: "failed" }), NOW)).toEqual(["請求失敗"]);
    expect(attentionReasons(makeAppt({ appointmentAt: FUTURE, chargeStatus: "requires_action" }), NOW)).toEqual(["要再認証"]);
  });
});

describe("confirmProgress", () => {
  it("confirmPageFirstViewedAtがあればviewed", () => {
    const a = makeAppt({ appointmentAt: FUTURE, confirmPageFirstViewedAt: "2026-03-02T00:00:00.000Z" });
    expect(confirmProgress(a)).toEqual({ state: "viewed", viewedAt: "2026-03-02T00:00:00.000Z" });
  });

  it("送信記録(LINE/SMS/メールいずれか)があればsent", () => {
    expect(confirmProgress(makeAppt({ appointmentAt: FUTURE, emailSentAt: "2026-03-02T00:00:00.000Z" }))).toEqual({ state: "sent" });
    expect(confirmProgress(makeAppt({ appointmentAt: FUTURE, lineSentAt: "2026-03-02T00:00:00.000Z" }))).toEqual({ state: "sent" });
    expect(confirmProgress(makeAppt({ appointmentAt: FUTURE, smsSentAt: "2026-03-02T00:00:00.000Z" }))).toEqual({ state: "sent" });
  });

  it("どちらも無ければnot_sent", () => {
    expect(confirmProgress(makeAppt({ appointmentAt: FUTURE }))).toEqual({ state: "not_sent" });
  });
});
