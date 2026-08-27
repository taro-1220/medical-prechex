// Phase K-B: executeOffSessionChargeの例外分類を検証する。
// getStripeClient()が返す実際のStripeインスタンスのpaymentIntents.createだけをスタブし、
// ネットワークには一切触れない。StripeのエラークラスはSDKが公開しているものをそのまま構築して使う
// （instanceof判定の実装を本物同様に検証するため、stripeパッケージ自体はモックしない）。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.STRIPE_SECRET_KEY = "sk_test_phasek_dummy_key_for_testing_only";

import Stripe from "stripe";
import { executeOffSessionCharge, getStripeClient, createAppointmentSetupIntent, attachPaymentMethodToCustomer } from "./stripe";

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
  let retrieveSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const client = getStripeClient();
    createSpy = vi.spyOn(client.paymentIntents, "create");
    // 検収で発覚した不具合の修正: 課金前にPaymentMethodのcustomer紐付けを確認する。
    // 個別のcustomer関連テスト以外では「紐付け済み」を既定にしておく
    retrieveSpy = vi.spyOn(client.paymentMethods, "retrieve").mockResolvedValue({ customer: "cus_default" } as never);
  });

  afterEach(() => {
    createSpy.mockRestore();
    retrieveSpy.mockRestore();
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

describe("executeOffSessionCharge: PaymentMethodのCustomer紐付け確認（検収で発覚した不具合の修正）", () => {
  let createSpy: ReturnType<typeof vi.spyOn>;
  let retrieveSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    createSpy?.mockRestore();
    retrieveSpy?.mockRestore();
  });

  it("PaymentIntent作成時にcustomerを渡す", async () => {
    const client = getStripeClient();
    retrieveSpy = vi.spyOn(client.paymentMethods, "retrieve").mockResolvedValue({ customer: "cus_abc123" } as never);
    createSpy = vi.spyOn(client.paymentIntents, "create").mockResolvedValueOnce({ id: "pi_ok", status: "succeeded" } as never);
    await executeOffSessionCharge(BASE_PARAMS);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_abc123" }),
      expect.anything(),
    );
  });

  it("customerがobject形式で返る場合もidを取り出して渡す", async () => {
    const client = getStripeClient();
    retrieveSpy = vi.spyOn(client.paymentMethods, "retrieve").mockResolvedValue({ customer: { id: "cus_obj456" } } as never);
    createSpy = vi.spyOn(client.paymentIntents, "create").mockResolvedValueOnce({ id: "pi_ok", status: "succeeded" } as never);
    await executeOffSessionCharge(BASE_PARAMS);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_obj456" }),
      expect.anything(),
    );
  });

  it("customerがnullの場合はsystemErrorとして返し、PaymentIntentは作成しない", async () => {
    const client = getStripeClient();
    retrieveSpy = vi.spyOn(client.paymentMethods, "retrieve").mockResolvedValue({ customer: null } as never);
    createSpy = vi.spyOn(client.paymentIntents, "create");
    const result = await executeOffSessionCharge(BASE_PARAMS);
    expect("systemError" in result).toBe(true);
    if ("systemError" in result) {
      expect(result.errorMessage).toContain("customer is null");
    }
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("paymentMethods.retrieveが失敗した場合はsystemErrorとして返し、PaymentIntentは作成しない", async () => {
    const client = getStripeClient();
    retrieveSpy = vi.spyOn(client.paymentMethods, "retrieve").mockRejectedValue(new Error("No such payment_method"));
    createSpy = vi.spyOn(client.paymentIntents, "create");
    const result = await executeOffSessionCharge(BASE_PARAMS);
    expect("systemError" in result).toBe(true);
    if ("systemError" in result) {
      expect(result.errorMessage).toContain("paymentMethods.retrieve failed");
      expect(result.errorMessage).toContain("No such payment_method");
    }
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe("createAppointmentSetupIntent: Customer作成・紐付け（検収で発覚した不具合の修正）", () => {
  it("Customerを先に作成し、SetupIntent作成時にcustomerを渡す", async () => {
    const client = getStripeClient();
    const customersCreateSpy = vi.spyOn(client.customers, "create").mockResolvedValueOnce({ id: "cus_new1" } as never);
    const setupIntentsCreateSpy = vi.spyOn(client.setupIntents, "create").mockResolvedValueOnce({
      id: "seti_1", client_secret: "seti_1_secret",
    } as never);

    await createAppointmentSetupIntent({ connectedAccountId: "acct_1", appointmentId: "appt-1" });

    expect(customersCreateSpy).toHaveBeenCalled();
    expect(setupIntentsCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_new1" }),
      expect.anything(),
    );

    customersCreateSpy.mockRestore();
    setupIntentsCreateSpy.mockRestore();
  });
});

describe("attachPaymentMethodToCustomer: confirm後の明示attach（検収で発覚した不具合の修正）", () => {
  it("paymentMethods.attachをconnected account上で呼ぶ", async () => {
    const client = getStripeClient();
    const attachSpy = vi.spyOn(client.paymentMethods, "attach").mockResolvedValueOnce({} as never);
    await attachPaymentMethodToCustomer("acct_1", "pm_1", "cus_1");
    expect(attachSpy).toHaveBeenCalledWith("pm_1", { customer: "cus_1" }, { stripeAccount: "acct_1" });
    attachSpy.mockRestore();
  });
});
