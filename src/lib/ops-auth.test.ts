// requireOpsAdmin: 未認証は401、運営者以外は403、運営者は通過することを検証する。
// 応答本文は既存の各/api/opsルートと同じ形（{ error: "Unauthorized" }/{ error: "Forbidden" }）を維持する。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }));

vi.mock("./supabase", () => ({
  getSupabase: () => ({ auth: { getUser: getUserMock } }),
}));

import { isOpsAdmin, requireOpsAdmin } from "./ops-auth";

function makeRequest(authHeader?: string) {
  return new NextRequest("http://localhost/api/ops/clinics", {
    headers: authHeader ? { Authorization: authHeader } : undefined,
  });
}

describe("isOpsAdmin", () => {
  const ORIGINAL_ENV = process.env.OPS_ADMIN_EMAILS;

  afterEach(() => {
    process.env.OPS_ADMIN_EMAILS = ORIGINAL_ENV;
  });

  it("OPS_ADMIN_EMAILSに含まれるメールはtrue（大文字小文字を区別しない）", () => {
    process.env.OPS_ADMIN_EMAILS = "taro.kaneko1220@gmail.com";
    expect(isOpsAdmin("TARO.KANEKO1220@GMAIL.COM")).toBe(true);
  });

  it("含まれないメールはfalse", () => {
    process.env.OPS_ADMIN_EMAILS = "taro.kaneko1220@gmail.com";
    expect(isOpsAdmin("other@example.com")).toBe(false);
  });

  it("OPS_ADMIN_EMAILS未設定なら常にfalse", () => {
    delete process.env.OPS_ADMIN_EMAILS;
    expect(isOpsAdmin("taro.kaneko1220@gmail.com")).toBe(false);
  });
});

describe("requireOpsAdmin", () => {
  const ORIGINAL_ENV = process.env.OPS_ADMIN_EMAILS;

  beforeEach(() => {
    getUserMock.mockReset();
    process.env.OPS_ADMIN_EMAILS = "admin@example.com";
  });

  afterEach(() => {
    process.env.OPS_ADMIN_EMAILS = ORIGINAL_ENV;
  });

  it("Authorizationヘッダーが無ければ401（Unauthorized）", async () => {
    const result = await requireOpsAdmin(makeRequest());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await result.response.json()).toEqual({ error: "Unauthorized" });
    }
  });

  it("トークンが無効なら401（Unauthorized）", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    const result = await requireOpsAdmin(makeRequest("Bearer bad-token"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await result.response.json()).toEqual({ error: "Unauthorized" });
    }
  });

  it("運営者以外は403（Forbidden）", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "someone@example.com" } }, error: null });
    const result = await requireOpsAdmin(makeRequest("Bearer token"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toEqual({ error: "Forbidden" });
    }
  });

  it("運営者は通過し、userを返す", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "admin@example.com" } }, error: null });
    const result = await requireOpsAdmin(makeRequest("Bearer token"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.email).toBe("admin@example.com");
    }
  });
});
