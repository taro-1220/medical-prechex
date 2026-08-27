// Phase K-B: executeOffSessionChargeの例外分類を検証する。
// getStripeClient()が返す実際のStripeインスタンスのpaymentIntents.createだけをスタブし、
// ネットワークには一切触れない。StripeのエラークラスはSDKが公開しているものをそのまま構築して使う
// （instanceof判定の実装を本物同様に検証するため、stripeパッケージ自体はモックしない）。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.STRIPE_SECRET_KEY = "sk_test_phasek_dummy_key_for_testing_only";

import Stripe from "stripe";
import { executeOffSessionCharge, getStripeClient } from "./stripe";

const BASE_PARAMS = {
  connectedAccountId: "acct_1",
  paymentMethodId: "pm_1",
  amountJpy: 5000,
  appointmentId: "appt-1",
  description: "検収クリニック キャンセル料（100%）",
  idempotencyKey: "appt-1:charge:pm_1",
};

describe("executeOffSessionCharge: 例外分類（Phase K-B）", () => {
  let createSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const client = getStripeClient();
    createSpy = vi.spyOn(client.paymentIntents, "create");
  });

  afterEach(() => {
    createSpy.mockRestore();
  });

  it("成功時はpaymentIntentId/status/requiresActionを返す", async () => {
    createSpy.mockResolvedValueOnce({ id: "pi_ok", status: "succeeded" } as never);
    const result = await executeOffSessionCharge(BASE_PARAMS);
    expect("systemError" in result).toBe(false);
    if (!("systemError" in result)) {
      expect(result.paymentIntentId).toBe("pi_ok");
      expect(result.status).toBe("succeeded");
      expect(result.requiresAction).toBe(false);
    }
  });

  it("StripeCardError（payment_intent付き）は従来どおりカード拒否の結果として返す", async () => {
    const cardError = new Stripe.errors.StripeCardError({
      message: "Your card was declined.",
      type: "card_error",
      payment_intent: { id: "pi_declined", status: "requires_payment_method" },
    } as never);
    createSpy.mockRejectedValueOnce(cardError);
    const result = await executeOffSessionCharge(BASE_PARAMS);
    expect("systemError" in result).toBe(false);
    if (!("systemError" in result)) {
      expect(result.paymentIntentId).toBe("pi_declined");
      expect(result.status).toBe("requires_payment_method");
    }
  });

  it("idempotency_error相当（StripeInvalidRequestError）はsystemErrorとして返し、例外を投げない", async () => {
    const idempotencyError = new Stripe.errors.StripeInvalidRequestError({
      message: "Keys for idempotent requests can only be used with the same parameters they were first used with",
      type: "idempotency_error",
    } as never);
    createSpy.mockRejectedValueOnce(idempotencyError);
    const result = await executeOffSessionCharge(BASE_PARAMS);
    expect("systemError" in result).toBe(true);
    if ("systemError" in result) {
      expect(result.errorMessage).toContain("idempotent");
    }
  });

  it("ネットワーク例外もsystemErrorとして返し、例外を投げない", async () => {
    createSpy.mockRejectedValueOnce(new Error("socket hang up"));
    const result = await executeOffSessionCharge(BASE_PARAMS);
    expect("systemError" in result).toBe(true);
    if ("systemError" in result) {
      expect(result.errorMessage).toContain("socket hang up");
    }
  });

  it("systemErrorのerrorMessageにカード番号等の機微情報は含まれない（Stripeエラーメッセージ自体がPANを含まないため）", async () => {
    const idempotencyError = new Stripe.errors.StripeInvalidRequestError({
      message: "Keys for idempotent requests can only be used with the same parameters",
      type: "idempotency_error",
    } as never);
    createSpy.mockRejectedValueOnce(idempotencyError);
    const result = await executeOffSessionCharge(BASE_PARAMS);
    if ("systemError" in result) {
      expect(result.errorMessage).not.toMatch(/\d{12,19}/); // 生カード番号らしき連続数字が含まれない
    }
  });
});
