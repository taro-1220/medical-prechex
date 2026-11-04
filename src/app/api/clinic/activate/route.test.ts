import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getUserMock, fromMock } = vi.hoisted(() => ({ getUserMock: vi.fn(), fromMock: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { getUser: getUserMock }, from: fromMock }),
}));

import { POST } from "./route";

const writes: Array<{ table: string; payload: unknown }> = [];

function stub(opts: { member: boolean; status: string; done: boolean; role?: string }) {
  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      update: (payload: unknown) => { writes.push({ table, payload }); return chain; },
      then: (r: (v: unknown) => void) => r({ error: null }),
      maybeSingle: async () => {
        if (table === "clinic_users") return { data: opts.member ? { clinic_id: "c1", role: opts.role ?? "owner" } : null };
        if (table === "clinics") return { data: { status: opts.status } };
        if (table === "onboarding_progress")
          return { data: { profile_completed: opts.done, policy_completed: opts.done, notification_completed: opts.done } };
        return { data: null };
      },
    };
    return chain;
  });
}

const req = (auth = true) =>
  new NextRequest("http://localhost/api/clinic/activate", {
    method: "POST",
    headers: auth ? { Authorization: "Bearer t" } : {},
    body: JSON.stringify({ clinicId: "c1" }),
  });

describe("POST /api/clinic/activate: 承認制を迂回させない", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writes.length = 0;
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  });

  it("未認証は401", async () => {
    stub({ member: true, status: "active", done: true });
    expect((await POST(req(false))).status).toBe(401);
  });
  it("非所属は403", async () => {
    stub({ member: false, status: "active", done: true });
    expect((await POST(req())).status).toBe(403);
    expect(writes).toHaveLength(0);
  });
  for (const status of ["pending_approval", "rejected"]) {
    it(`${status} の医院は初期設定完了済みでも403で、何も書き込まない`, async () => {
      stub({ member: true, status, done: true });
      expect((await POST(req())).status).toBe(403);
      expect(writes).toHaveLength(0);
    });
  }
  it("active かつ初期設定完了なら activated_at のみ更新し clinics.status は書かない", async () => {
    stub({ member: true, status: "active", done: true });
    expect((await POST(req())).status).toBe(200);
    expect(writes.every(w => w.table === "onboarding_progress")).toBe(true);
    expect(writes.some(w => w.table === "clinics")).toBe(false);
  });
  it("active でも初期設定未完了なら400", async () => {
    stub({ member: true, status: "active", done: false });
    expect((await POST(req())).status).toBe(400);
  });
  it("staff は初期設定の有効化ができず403（settings 権限は owner/manager）", async () => {
    stub({ member: true, status: "active", done: true, role: "staff" });
    expect((await POST(req())).status).toBe(403);
    expect(writes).toHaveLength(0);
  });
  it("manager は active 医院で有効化できる", async () => {
    stub({ member: true, status: "active", done: true, role: "manager" });
    expect((await POST(req())).status).toBe(200);
  });
});
