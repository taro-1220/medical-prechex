import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { requireOpsAdminMock, getRecentNotificationSummaryMock } = vi.hoisted(() => ({
  requireOpsAdminMock: vi.fn(),
  getRecentNotificationSummaryMock: vi.fn(),
}));

vi.mock("@/lib/ops-auth", () => ({ requireOpsAdmin: requireOpsAdminMock }));
vi.mock("@/lib/notification-run-store", () => ({ getRecentNotificationSummary: getRecentNotificationSummaryMock }));

import { GET } from "./route";

function makeRequest() {
  return new NextRequest("http://localhost/api/ops/notifications/summary", { headers: { Authorization: "Bearer t" } });
}

describe("GET /api/ops/notifications/summary", () => {
  beforeEach(() => {
    requireOpsAdminMock.mockReset();
    getRecentNotificationSummaryMock.mockReset();
  });

  it("運営者でなければそのままエラー応答を返す", async () => {
    const forbidden = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    requireOpsAdminMock.mockResolvedValue({ ok: false, response: forbidden });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    expect(getRecentNotificationSummaryMock).not.toHaveBeenCalled();
  });

  it("運営者なら直近24時間のサマリを返す", async () => {
    requireOpsAdminMock.mockResolvedValue({ ok: true, user: { id: "u1" } });
    getRecentNotificationSummaryMock.mockResolvedValue({ available: true, sent: 5, failed: 1, skipped: 0, capped: 0, lastRunAt: "2026-03-05T08:01:00.000Z" });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true, sent: 5, failed: 1, skipped: 0, capped: 0, lastRunAt: "2026-03-05T08:01:00.000Z" });
  });

  it("migration未適用時はavailable:falseを返す", async () => {
    requireOpsAdminMock.mockResolvedValue({ ok: true, user: { id: "u1" } });
    getRecentNotificationSummaryMock.mockResolvedValue({ available: false });
    const res = await GET(makeRequest());
    expect(await res.json()).toEqual({ available: false });
  });
});
