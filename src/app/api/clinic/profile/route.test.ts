import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { requireClinicAccessMock, upsertMock, fromMock } = vi.hoisted(() => ({
  requireClinicAccessMock: vi.fn(),
  upsertMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/clinic-access", () => ({ requireClinicAccess: requireClinicAccessMock }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ from: fromMock }) }));

import { PUT } from "./route";
import { NextResponse } from "next/server";

function deny() {
  return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}
function ok() {
  return { ok: true as const, user: { id: "u1" }, clinicId: "clinic-1", role: "owner", clinicStatus: "active" };
}

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/clinic/profile", { method: "PUT", body: JSON.stringify(body) });
}

describe("PUT /api/clinic/profile", () => {
  beforeEach(() => {
    requireClinicAccessMock.mockReset();
    upsertMock.mockReset();
    fromMock.mockReset();
    upsertMock.mockResolvedValue({ error: null });
    fromMock.mockImplementation(() => ({ upsert: upsertMock }));
  });

  it("clinicId無しは400", async () => {
    const res = await PUT(makeRequest({ phone: "03-1111-2222" }));
    expect(res.status).toBe(400);
    expect(requireClinicAccessMock).not.toHaveBeenCalled();
  });

  it("設定権限が無ければそのまま応答を返す（保存しない）", async () => {
    requireClinicAccessMock.mockResolvedValue(deny());
    const res = await PUT(makeRequest({ clinicId: "clinic-1", phone: "03-1111-2222" }));
    expect(res.status).toBe(403);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("権限があれば電話番号をclinic_profileへ保存する", async () => {
    requireClinicAccessMock.mockResolvedValue(ok());
    const res = await PUT(makeRequest({ clinicId: "clinic-1", phone: "03-1111-2222" }));
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ clinic_id: "clinic-1", phone: "03-1111-2222" }),
      { onConflict: "clinic_id" },
    );
  });
});
