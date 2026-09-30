// site-gate（SITE_ACCESS_PASSWORD）のBYPASS_PATHSに/termsが含まれ、
// 未認証（クッキー無し）でも/termsが素通りすることを確認する。
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

describe("middleware: /termsはsite-gateをバイパスする", () => {
  const ORIGINAL_PASSWORD = process.env.SITE_ACCESS_PASSWORD;

  beforeEach(() => {
    process.env.SITE_ACCESS_PASSWORD = "test-password";
  });

  afterEach(() => {
    process.env.SITE_ACCESS_PASSWORD = ORIGINAL_PASSWORD;
  });

  it("/terms は未認証（クッキー無し）でもリダイレクトされずそのまま通す", async () => {
    const req = new NextRequest("http://localhost/terms");
    const res = await middleware(req);
    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
  });

  it("/terms/以下のサブパスも同様に通す", async () => {
    const req = new NextRequest("http://localhost/terms/sub");
    const res = await middleware(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("/terms/clinic（医院向け利用規約）も /terms の前方一致で通す", async () => {
    const req = new NextRequest("http://localhost/terms/clinic");
    const res = await middleware(req);
    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
  });

  it("/about（サービス紹介）も未認証で通す", async () => {
    const req = new NextRequest("http://localhost/about");
    const res = await middleware(req);
    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
  });

  it("比較: バイパス対象外のパスは未認証だとsite-gateへリダイレクトされる", async () => {
    const req = new NextRequest("http://localhost/some-protected-page");
    const res = await middleware(req);
    expect(res.headers.get("location")).toContain("/site-gate");
  });

  it("/api/ops/me は未認証（クッキー無し）でも401にならず通す（本人判定はルート自身が行う）", async () => {
    const req = new NextRequest("http://localhost/api/ops/me");
    const res = await middleware(req);
    expect(res.status).not.toBe(401);
  });

  it("/api/ops/clinics はバイパス対象外のまま。未認証だと401（api配下はリダイレクトせずjson）", async () => {
    const req = new NextRequest("http://localhost/api/ops/clinics");
    const res = await middleware(req);
    expect(res.status).toBe(401);
  });
});
