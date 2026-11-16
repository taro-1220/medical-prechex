import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { requireClinicAccessMock, deactivateClinicStaffMemberMock } = vi.hoisted(() => ({
  requireClinicAccessMock: vi.fn(),
  deactivateClinicStaffMemberMock: vi.fn(),
}));

vi.mock("@/lib/clinic-access", () => ({ requireClinicAccess: requireClinicAccessMock }));
vi.mock("@/lib/clinic-staff-store", () => ({ deactivateClinicStaffMember: deactivateClinicStaffMemberMock }));

import { PATCH } from "./route";

function ok() {
  return { ok: true as const, user: { id: "u1" }, clinicId: "clinic-1", role: "owner", clinicStatus: "active" };
}
function deny() {
  return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/clinic/staff/staff-1", { method: "PATCH", body: JSON.stringify(body) });
}
function params() {
  return { params: Promise.resolve({ id: "staff-1" }) };
}

describe("PATCH /api/clinic/staff/[id]", () => {
  beforeEach(() => {
    requireClinicAccessMock.mockReset();
    deactivateClinicStaffMemberMock.mockReset();
  });

  it("clinicId無しは400", async () => {
    const res = await PATCH(makeRequest({ active: false }), params());
    expect(res.status).toBe(400);
  });

  it("settings権限が無ければ無効化しない", async () => {
    requireClinicAccessMock.mockResolvedValue(deny());
    const res = await PATCH(makeRequest({ clinicId: "clinic-1", active: false }), params());
    expect(res.status).toBe(403);
    expect(deactivateClinicStaffMemberMock).not.toHaveBeenCalled();
  });

  it("active:false以外は400（無効化以外は未対応）", async () => {
    requireClinicAccessMock.mockResolvedValue(ok());
    const res = await PATCH(makeRequest({ clinicId: "clinic-1", active: true }), params());
    expect(res.status).toBe(400);
    expect(deactivateClinicStaffMemberMock).not.toHaveBeenCalled();
  });

  it("settings権限があれば無効化できる", async () => {
    requireClinicAccessMock.mockResolvedValue(ok());
    deactivateClinicStaffMemberMock.mockResolvedValue(true);
    const res = await PATCH(makeRequest({ clinicId: "clinic-1", active: false }), params());
    expect(res.status).toBe(200);
    expect(deactivateClinicStaffMemberMock).toHaveBeenCalledWith("clinic-1", "staff-1");
  });
});
