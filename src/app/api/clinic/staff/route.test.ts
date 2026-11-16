import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { requireClinicAccessMock, listClinicStaffMock, addClinicStaffMemberMock } = vi.hoisted(() => ({
  requireClinicAccessMock: vi.fn(),
  listClinicStaffMock: vi.fn(),
  addClinicStaffMemberMock: vi.fn(),
}));

vi.mock("@/lib/clinic-access", () => ({ requireClinicAccess: requireClinicAccessMock }));
vi.mock("@/lib/clinic-staff-store", () => ({
  listClinicStaff: listClinicStaffMock,
  addClinicStaffMember: addClinicStaffMemberMock,
}));

import { GET, POST } from "./route";

function ok() {
  return { ok: true as const, user: { id: "u1" }, clinicId: "clinic-1", role: "owner", clinicStatus: "active" };
}
function deny() {
  return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

describe("GET /api/clinic/staff", () => {
  beforeEach(() => {
    requireClinicAccessMock.mockReset();
    listClinicStaffMock.mockReset();
  });

  it("clinic_id無しは400", async () => {
    const res = await GET(new NextRequest("http://localhost/api/clinic/staff"));
    expect(res.status).toBe(400);
  });

  it("view権限で一覧を返す", async () => {
    requireClinicAccessMock.mockResolvedValue(ok());
    listClinicStaffMock.mockResolvedValue([{ id: "s1", clinicId: "clinic-1", name: "受付担当", active: true, createdAt: "", updatedAt: "" }]);
    const res = await GET(new NextRequest("http://localhost/api/clinic/staff?clinic_id=clinic-1&active_only=true"));
    expect(res.status).toBe(200);
    expect(listClinicStaffMock).toHaveBeenCalledWith("clinic-1", true);
  });

  it("権限が無ければそのまま応答を返す", async () => {
    requireClinicAccessMock.mockResolvedValue(deny());
    const res = await GET(new NextRequest("http://localhost/api/clinic/staff?clinic_id=clinic-1"));
    expect(res.status).toBe(403);
  });
});

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/clinic/staff", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/clinic/staff", () => {
  beforeEach(() => {
    requireClinicAccessMock.mockReset();
    addClinicStaffMemberMock.mockReset();
  });

  it("clinicId無しは400", async () => {
    const res = await POST(makeRequest({ name: "受付担当" }));
    expect(res.status).toBe(400);
  });

  it("settings権限が無ければ追加しない", async () => {
    requireClinicAccessMock.mockResolvedValue(deny());
    const res = await POST(makeRequest({ clinicId: "clinic-1", name: "受付担当" }));
    expect(res.status).toBe(403);
    expect(addClinicStaffMemberMock).not.toHaveBeenCalled();
  });

  it("settings権限があれば追加できる", async () => {
    requireClinicAccessMock.mockResolvedValue(ok());
    addClinicStaffMemberMock.mockResolvedValue({ ok: true, member: { id: "s1", clinicId: "clinic-1", name: "受付担当", active: true, createdAt: "", updatedAt: "" } });
    const res = await POST(makeRequest({ clinicId: "clinic-1", name: "受付担当" }));
    expect(res.status).toBe(200);
  });

  it("invalid/unsupportedをそれぞれ400/503で返す", async () => {
    requireClinicAccessMock.mockResolvedValue(ok());
    addClinicStaffMemberMock.mockResolvedValue({ ok: false, reason: "invalid" });
    expect((await POST(makeRequest({ clinicId: "clinic-1", name: "" }))).status).toBe(400);
    addClinicStaffMemberMock.mockResolvedValue({ ok: false, reason: "unsupported" });
    expect((await POST(makeRequest({ clinicId: "clinic-1", name: "受付担当" }))).status).toBe(503);
  });
});
