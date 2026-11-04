import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getUserMock, db, ops } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  db: { mine: [] as string[], statuses: {} as Record<string, string> },
  ops: [] as string[],
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: { getUser: getUserMock },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.in = () => chain;
      chain.update = (v: unknown) => { ops.push(`${table}.update:${JSON.stringify(v)}`); return chain; };
      chain.maybeSingle = async () => ({ data: table === "clinic_users" ? { id: "x" } : null, error: null });
      chain.then = (r: (v: unknown) => void) => {
        if (table === "clinic_users") return r({ data: db.mine.map(id => ({ clinic_id: id })), error: null });
        if (table === "clinics") return r({ data: Object.entries(db.statuses).map(([id, status]) => ({ id, status })), error: null });
        return r({ error: null });
      };
      return chain;
    },
  }),
}));

import { POST } from "../select/route";

const req = () => new NextRequest("http://localhost/api/clinic/select", {
  method: "POST", headers: { Authorization: "Bearer t" }, body: JSON.stringify({ clinicId: "pending1" }),
});

beforeEach(() => {
  ops.length = 0;
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
});

describe("POST /api/clinic/select: 承認待ち医院へ切り替えて戻れなくなるのを防ぐ", () => {
  it("active な医院を持つユーザーは pending 医院を選択できない（403・selected を変更しない）", async () => {
    db.mine = ["active1", "pending1"];
    db.statuses = { active1: "active", pending1: "pending_approval" };
    expect((await POST(req())).status).toBe(403);
    expect(ops.filter(o => o.includes("selected"))).toHaveLength(0);
  });
  it("active 医院が無ければ従来どおり選択できる", async () => {
    db.mine = ["pending1"];
    db.statuses = { pending1: "pending_approval" };
    expect((await POST(req())).status).toBe(200);
  });
});
