import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getUserMock, fromMock, inserted, existing } = vi.hoisted(() => ({
  getUserMock: vi.fn(), fromMock: vi.fn(), inserted: [] as Array<{ table: string; row: Record<string, unknown> }>,
  existing: { rows: [] as Array<{ clinic_id: string }> },
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { getUser: getUserMock }, from: fromMock }),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  inserted.length = 0;
  existing.rows = [];
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {
      insert: (row: Record<string, unknown>) => { inserted.push({ table, row }); return chain; },
      update: () => chain,
      eq: () => chain,
      select: () => chain,
      single: async () => ({ data: { id: "c1", name: "n", status: "pending_approval", created_at: "", updated_at: "" }, error: null }),
      then: (r: (v: unknown) => void) => r(table === "clinic_users" ? { data: existing.rows, error: null } : { error: null }),
    };
    return chain;
  });
});

const req = (auth = true) =>
  new NextRequest("http://localhost/api/clinic/create", {
    method: "POST",
    headers: auth ? { Authorization: "Bearer t" } : {},
    body: JSON.stringify({ name: "テスト医院", status: "active" }),
  });

describe("POST /api/clinic/create", () => {
  it("未認証は401", async () => {
    expect((await POST(req(false))).status).toBe(401);
    expect(inserted).toHaveLength(0);
  });
  it("常に pending_approval で作成する（クライアントが status:active を送っても無視）", async () => {
    expect((await POST(req())).status).toBe(201);
    const clinic = inserted.find(i => i.table === "clinics");
    expect(clinic?.row.status).toBe("pending_approval");
  });
  it("所属医院が無い場合のみ新規医院を selected=true にする", async () => {
    await POST(req());
    expect(inserted.find(i => i.table === "clinic_users")?.row.selected).toBe(true);
  });
  it("既存医院がある場合は新規 pending 医院を selected にしない（操作対象を奪わない）", async () => {
    existing.rows = [{ clinic_id: "active1" }];
    await POST(req());
    expect(inserted.find(i => i.table === "clinic_users")?.row.selected).toBe(false);
  });
});
