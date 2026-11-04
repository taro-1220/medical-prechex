import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getUserMock, fromMock, getAppointmentByIdMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  getAppointmentByIdMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { getUser: getUserMock }, from: fromMock }),
}));

vi.mock("@/lib/store", () => ({
  getAppointmentById: getAppointmentByIdMock,
}));

import { GET } from "./route";

const VALID_ID = "11111111-1111-1111-1111-111111111111";

function makeRequest(authHeader?: string) {
  return new NextRequest(`http://localhost/api/clinic/appointments/${VALID_ID}`, {
    headers: authHeader ? { Authorization: authHeader } : undefined,
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
