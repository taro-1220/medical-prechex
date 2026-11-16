import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getUserMock, fromMock, getAppointmentByIdMock, updateAppointmentHandoffMock, getClinicStaffMemberMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  getAppointmentByIdMock: vi.fn(),
  updateAppointmentHandoffMock: vi.fn(),
  getClinicStaffMemberMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { getUser: getUserMock }, from: fromMock }),
}));

vi.mock("@/lib/store", () => ({
  getAppointmentById: getAppointmentByIdMock,
  updateAppointmentHandoff: updateAppointmentHandoffMock,
}));

vi.mock("@/lib/clinic-staff-store", () => ({
  getClinicStaffMember: getClinicStaffMemberMock,
}));

import { GET, PUT } from "./route";

const VALID_ID = "11111111-1111-1111-1111-111111111111";

function makeRequest(authHeader?: string) {
  return new NextRequest(`http://localhost/api/clinic/appointments/${VALID_ID}`, {
    headers: authHeader ? { Authorization: authHeader } : undefined,
  });
}

function makePutRequest(body: unknown, authHeader = "Bearer t") {
  return new NextRequest(`http://localhost/api/clinic/appointments/${VALID_ID}`, {
    method: "PUT",
    headers: { Authorization: authHeader },
    body: JSON.stringify(body),
  });
}

function params(id: string = VALID_ID) {
  return { params: Promise.resolve({ id }) };
}

function stubClinicMember(matches: boolean, role: string = "staff") {
  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => {
        if (table === "clinic_users") {
          return matches ? { data: { role }, error: null } : { data: null, error: null };
        }
        if (table === "clinics") {
          return { data: { status: "active" }, error: null };
        }
        return { data: null, error: null };
      },
    };
    return chain;
  });
}

describe("GET /api/clinic/appointments/[id]", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
    getAppointmentByIdMock.mockReset();
    updateAppointmentHandoffMock.mockReset();
    getClinicStaffMemberMock.mockReset();
  });

  it("未認証なら401", async () => {
    const res = await GET(makeRequest(), params());
    expect(res.status).toBe(401);
    expect(getAppointmentByIdMock).not.toHaveBeenCalled();
  });

  it("IDがUUID形式でなければDBに問い合わせず404", async () => {
    const res = await GET(makeRequest("Bearer t"), params("not-a-uuid"));
    expect(res.status).toBe(404);
    expect(getAppointmentByIdMock).not.toHaveBeenCalled();
  });

  it("予約が存在しなければ404", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getAppointmentByIdMock.mockResolvedValue(undefined);
    const res = await GET(makeRequest("Bearer t"), params());
    expect(res.status).toBe(404);
  });

  it("所属していない医院の予約なら403", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getAppointmentByIdMock.mockResolvedValue({ id: VALID_ID, clinicId: "clinic-1", status: "confirmed" });
    stubClinicMember(false);
    const res = await GET(makeRequest("Bearer t"), params());
    expect(res.status).toBe(403);
  });

  it("所属医院の予約なら200で予約詳細を返す", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const appt = { id: VALID_ID, clinicId: "clinic-1", status: "confirmed", token: "tok1" };
    getAppointmentByIdMock.mockResolvedValue(appt);
    stubClinicMember(true);
    const res = await GET(makeRequest("Bearer t"), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(appt);
  });
});

describe("PUT /api/clinic/appointments/[id]", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
    getAppointmentByIdMock.mockReset();
    updateAppointmentHandoffMock.mockReset();
    getClinicStaffMemberMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    updateAppointmentHandoffMock.mockResolvedValue({ ok: true });
  });

  it("来院済み（checked_in）は編集不可で409", async () => {
    getAppointmentByIdMock.mockResolvedValue({ id: VALID_ID, clinicId: "clinic-1", status: "checked_in" });
    stubClinicMember(true);
    const res = await PUT(makePutRequest({ handoffNote: "備考" }), params());
    expect(res.status).toBe(409);
    expect(updateAppointmentHandoffMock).not.toHaveBeenCalled();
  });

  it("completedも編集不可で409", async () => {
    getAppointmentByIdMock.mockResolvedValue({ id: VALID_ID, clinicId: "clinic-1", status: "completed" });
    stubClinicMember(true);
    const res = await PUT(makePutRequest({ handoffNote: "備考" }), params());
    expect(res.status).toBe(409);
  });

  it("confirmation_pending等は編集でき、担当・備考を保存する", async () => {
    getAppointmentByIdMock.mockResolvedValue({ id: VALID_ID, clinicId: "clinic-1", status: "confirmation_pending" });
    stubClinicMember(true);
    getClinicStaffMemberMock.mockResolvedValue({ id: "staff-1", clinicId: "clinic-1", name: "受付担当", active: true, createdAt: "", updatedAt: "" });
    const res = await PUT(makePutRequest({ staffId: "staff-1", handoffNote: "車椅子対応" }), params());
    expect(res.status).toBe(200);
    expect(updateAppointmentHandoffMock).toHaveBeenCalledWith(VALID_ID, { staffId: "staff-1", handoffNote: "車椅子対応" });
  });

  it("他院のスタッフIDを指定すると400", async () => {
    getAppointmentByIdMock.mockResolvedValue({ id: VALID_ID, clinicId: "clinic-1", status: "confirmed" });
    stubClinicMember(true);
    getClinicStaffMemberMock.mockResolvedValue({ id: "staff-1", clinicId: "other-clinic", name: "受付担当", active: true, createdAt: "", updatedAt: "" });
    const res = await PUT(makePutRequest({ staffId: "staff-1" }), params());
    expect(res.status).toBe(400);
    expect(updateAppointmentHandoffMock).not.toHaveBeenCalled();
  });

  it("備考が500文字を超えると400", async () => {
    getAppointmentByIdMock.mockResolvedValue({ id: VALID_ID, clinicId: "clinic-1", status: "confirmed" });
    stubClinicMember(true);
    const res = await PUT(makePutRequest({ handoffNote: "あ".repeat(501) }), params());
    expect(res.status).toBe(400);
    expect(updateAppointmentHandoffMock).not.toHaveBeenCalled();
  });

  it("所属していない医院なら403", async () => {
    getAppointmentByIdMock.mockResolvedValue({ id: VALID_ID, clinicId: "clinic-1", status: "confirmed" });
    stubClinicMember(false);
    const res = await PUT(makePutRequest({ handoffNote: "備考" }), params());
    expect(res.status).toBe(403);
  });
});
