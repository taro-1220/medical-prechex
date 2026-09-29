// Stripeキーのガード（本番=sk_live_必須、それ以外=sk_test_必須）を検証する。
// getStripeClient()はモジュールスコープでStripeクライアントをキャッシュするため、
// シナリオごとにvi.resetModules()してから動的importし直し、まっさらな状態で確認する。
import { describe, it, expect, beforeEach, vi } from "vitest";
import { validateStripeSecretKeyForEnvironment } from "./stripe";

describe("validateStripeSecretKeyForEnvironment: 環境ごとに要求するキーの種類が切り替わる", () => {
  it("本番（VERCEL_ENV=production）＋sk_live_ → 許可（例外を投げない）", () => {
    expect(() => validateStripeSecretKeyForEnvironment("sk_live_xxx", "production")).not.toThrow();
  });

  it("本番＋sk_test_ → 拒否", () => {
    expect(() => validateStripeSecretKeyForEnvironment("sk_test_xxx", "production")).toThrow(
      /production/,
    );
  });

  it("本番以外（VERCEL_ENV未設定）＋sk_test_ → 許可（例外を投げない）", () => {
    expect(() => validateStripeSecretKeyForEnvironment("sk_test_xxx", undefined)).not.toThrow();
  });

  it("本番以外（VERCEL_ENV=preview）＋sk_test_ → 許可（例外を投げない）", () => {
    expect(() => validateStripeSecretKeyForEnvironment("sk_test_xxx", "preview")).not.toThrow();
  });

  it("本番以外＋sk_live_ → 拒否", () => {
    expect(() => validateStripeSecretKeyForEnvironment("sk_live_xxx", undefined)).toThrow(
      /sk_test_/,
    );
  });

  it("エラー文にキーの値そのものは含まれない", () => {
    try {
      validateStripeSecretKeyForEnvironment("sk_test_should_not_leak", "production");
      throw new Error("throwされるはずだった");
    } catch (e) {
      expect((e as Error).message).not.toContain("sk_test_should_not_leak");
    }
  });
});

describe("getStripeClient(): キー未設定時は従来どおりのエラーのまま", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.VERCEL_ENV;
  });

  it("STRIPE_SECRET_KEYが未設定なら「STRIPE_SECRET_KEY is not set」を投げる（環境判定より前）", async () => {
    const { getStripeClient } = await import("./stripe");
    expect(() => getStripeClient()).toThrow("STRIPE_SECRET_KEY is not set");
  });

  it("本番でsk_live_キーなら実際にgetStripeClient()が例外を投げずクライアントを返す", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_live_dummy_for_guard_test_only";
    const { getStripeClient } = await import("./stripe");
    expect(() => getStripeClient()).not.toThrow();
  });

  it("本番でsk_test_キーならgetStripeClient()が例外を投げる", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_for_guard_test_only";
    const { getStripeClient } = await import("./stripe");
    expect(() => getStripeClient()).toThrow(/production/);
  });
});
