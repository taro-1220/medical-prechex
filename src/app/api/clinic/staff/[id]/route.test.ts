import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { requireClinicAccessMock, deactivateClinicStaffMemberMock, reactivateClinicStaffMemberMock } = vi.hoisted(() => ({
  requireClinicAccessMock: vi.fn(),
  deactivateClinicStaffMemberMock: vi.fn(),
  reactivateClinicStaffMemberMock: vi.fn(),
}));

vi.mock("@/lib/clinic-access", () => ({ requireClinicAccess: requireClinicAccessMock }));
vi.mock("@/lib/clinic-staff-store", () => ({
  deactivateClinicStaffMember: deactivateClinicStaffMemberMock,
  reactivateClinicStaffMember: reactivateClinicStaffMemberMock,
}));

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
    reactivateClinicStaffMemberMock.mockReset();
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

  it("activeがbooleanでなければ400", async () => {
    requireClinicAccessMock.mockResolvedValue(ok());
    const res = await PATCH(makeRequest({ clinicId: "clinic-1" }), params());
    expect(res.status).toBe(400);
    expect(deactivateClinicStaffMemberMock).not.toHaveBeenCalled();
    expect(reactivateClinicStaffMemberMock).not.toHaveBeenCalled();
  });

  it("active:trueなら有効に戻す", async () => {
    requireClinicAccessMock.mockResolvedValue(ok());
    reactivateClinicStaffMemberMock.mockResolvedValue({ ok: true });
    const res = await PATCH(makeRequest({ clinicId: "clinic-1", active: true }), params());
    expect(res.status).toBe(200);
    expect(reactivateClinicStaffMemberMock).toHaveBeenCalledWith("clinic-1", "staff-1");
    expect(deactivateClinicStaffMemberMock).not.toHaveBeenCalled();
  });

  it("同じ名前の有効なスタッフが既にいる場合は409で戻さない", async () => {
    requireClinicAccessMock.mockResolvedValue(ok());
    reactivateClinicStaffMemberMock.mockResolvedValue({ ok: false, reason: "duplicate_name" });
    const res = await PATCH(makeRequest({ clinicId: "clinic-1", active: true }), params());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("同じ名前のスタッフが登録されています");
  });

  it("他院のスタッフIDなら404", async () => {
    requireClinicAccessMock.mockResolvedValue(ok());
    reactivateClinicStaffMemberMock.mockResolvedValue({ ok: false, reason: "not_found" });
    const res = await PATCH(makeRequest({ clinicId: "clinic-1", active: true }), params());
    expect(res.status).toBe(404);
  });

  it("有効に戻す場合も権限が無ければ実行しない", async () => {
    requireClinicAccessMock.mockResolvedValue(deny());
    const res = await PATCH(makeRequest({ clinicId: "clinic-1", active: true }), params());
    expect(res.status).toBe(403);
    expect(reactivateClinicStaffMemberMock).not.toHaveBeenCalled();
  });

  it("settings権限があれば無効化できる", async () => {
    requireClinicAccessMock.mockResolvedValue(ok());
    deactivateClinicStaffMemberMock.mockResolvedValue(true);
    const res = await PATCH(makeRequest({ clinicId: "clinic-1", active: false }), params());
    expect(res.status).toBe(200);
    expect(deactivateClinicStaffMemberMock).toHaveBeenCalledWith("clinic-1", "staff-1");
  });
});
