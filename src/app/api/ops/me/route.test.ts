// GET /api/ops/me: 認証のみのエンドポイント。未認証は401、認証済みなら
// 運営者かどうかを{ isOpsAdmin: boolean }で返す（運営者以外でも200）。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { getUser: getUserMock } }),
}));

import { GET } from "./route";

function makeRequest(authHeader?: string) {
  return new NextRequest("http://localhost/api/ops/me", {
    headers: authHeader ? { Authorization: authHeader } : undefined,
  });
}

describe("GET /api/ops/me", () => {
  const ORIGINAL_ENV = process.env.OPS_ADMIN_EMAILS;

  beforeEach(() => {
    getUserMock.mockReset();
    process.env.OPS_ADMIN_EMAILS = "admin@example.com";
  });

  afterEach(() => {
    process.env.OPS_ADMIN_EMAILS = ORIGINAL_ENV;
  });

  it("Authorizationヘッダーが無ければ401（Unauthorized）", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("トークンが無効なら401（Unauthorized）", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    const res = await GET(makeRequest("Bearer bad-token"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("運営者なら200で{ isOpsAdmin: true }", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "admin@example.com" } }, error: null });
    const res = await GET(makeRequest("Bearer token"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isOpsAdmin: true });
  });

  it("運営者以外でも200で{ isOpsAdmin: false }（403にはしない）", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u2", email: "someone@example.com" } }, error: null });
    const res = await GET(makeRequest("Bearer token"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isOpsAdmin: false });
  });
});
