// instrumentation.tsのregister()が、起動時に公開可能キーの環境不整合を
// 検知して例外を投げることを確認する。NEXT_RUNTIME=nodejs以外（edge等）では
// 何もしないことも確認する。
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("register(): 起動時にNEXT_PUBLIC_STRIPE_PUBLISHABLE_KEYの環境整合性を検証する", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  });

  it("本番でpk_test_（食い違い）なら起動時に例外を投げる", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_dummy_for_instrumentation_test";
    const { register } = await import("./instrumentation");
    await expect(register()).rejects.toThrow(/production/);
  });

  it("本番でpk_live_（一致）なら起動時に例外を投げない", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_live_dummy_for_instrumentation_test";
    const { register } = await import("./instrumentation");
    await expect(register()).resolves.not.toThrow();
  });

  it("本番以外でpk_live_（食い違い）なら起動時に例外を投げる", async () => {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_live_dummy_for_instrumentation_test";
    const { register } = await import("./instrumentation");
    await expect(register()).rejects.toThrow(/pk_test_/);
  });

  it("公開可能キーが未設定なら何もしない（既存の未設定時挙動を変えない）", async () => {
    const { register } = await import("./instrumentation");
    await expect(register()).resolves.not.toThrow();
  });

  it("NEXT_RUNTIMEがnodejsでない場合は検証しない（edge等）", async () => {
    process.env.NEXT_RUNTIME = "edge";
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_dummy_should_be_skipped";
    const { register } = await import("./instrumentation");
    await expect(register()).resolves.not.toThrow();
  });
});
