import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getUserMock, fromMock, createAppointmentMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(), fromMock: vi.fn(), createAppointmentMock: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { getUser: getUserMock }, from: fromMock }),
}));
vi.mock("@/lib/store", () => ({ createAppointment: createAppointmentMock, getAllAppointments: vi.fn() }));

import { POST } from "./route";

function stub(memberships: Array<{ clinic_id: string; selected: boolean; role?: string }>, status: string) {
  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => {
        if (table === "clinics") return { data: { status }, error: null };
        if (table === "clinic_users") {
          const m = memberships[0];
          return { data: m ? { role: m.role ?? "owner" } : null, error: null };
        }
        return { data: null, error: null };
      },
      then: (r: (v: unknown) => void) =>
        r(table === "clinic_users" ? { data: memberships, error: null } : { data: null, error: null }),
    };
    return chain;
  });
}

const req = (body: object, auth = true) =>
  new NextRequest("http://localhost/api/appointments", {
    method: "POST",
    headers: auth ? { Authorization: "Bearer t" } : {},
    body: JSON.stringify(body),
  });
const valid = { patientName: "山田", appointmentAt: "2030-01-01T10:00:00+09:00" };

describe("POST /api/appointments: 認証・所属・承認", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    createAppointmentMock.mockResolvedValue({ id: "a1" });
  });
  it("未認証は401", async () => {
    stub([], "active");
    expect((await POST(req(valid, false))).status).toBe(401);
  });
  it("所属なしは403", async () => {
    stub([], "active");
    expect((await POST(req(valid))).status).toBe(403);
    expect(createAppointmentMock).not.toHaveBeenCalled();
  });
  it("他院の clinicId 指定は403", async () => {
    stub([{ clinic_id: "c1", selected: true }], "active");
    expect((await POST(req({ ...valid, clinicId: "other" }))).status).toBe(403);
    expect(createAppointmentMock).not.toHaveBeenCalled();
  });
  for (const status of ["pending_approval", "rejected"]) {
    it(`${status} の医院は403で予約を作成しない`, async () => {
      stub([{ clinic_id: "c1", selected: true }], status);
      expect((await POST(req(valid))).status).toBe(403);
      expect(createAppointmentMock).not.toHaveBeenCalled();
    });
  }
  it("active の所属医院は201。clinic_id は所属から確定される", async () => {
    stub([{ clinic_id: "c1", selected: true }], "active");
    expect((await POST(req(valid))).status).toBe(201);
    expect(createAppointmentMock.mock.calls[0][1]).toBe("c1");
  });
  for (const role of ["owner", "manager", "staff"]) {
    it(`${role} は active 医院で予約を作成できる`, async () => {
      stub([{ clinic_id: "c1", selected: true, role }], "active");
      expect((await POST(req(valid))).status).toBe(201);
      expect(createAppointmentMock.mock.calls[0][1]).toBe("c1");
    });
    it(`${role} でも pending_approval / rejected の医院は403`, async () => {
      for (const status of ["pending_approval", "rejected"]) {
        stub([{ clinic_id: "c1", selected: true, role }], status);
        expect((await POST(req(valid))).status).toBe(403);
      }
      expect(createAppointmentMock).not.toHaveBeenCalled();
    });
    it(`${role}: clinic_id を偽装して他院で作成しようとすると403`, async () => {
      stub([{ clinic_id: "c1", selected: true, role }], "active");
      expect((await POST(req({ ...valid, clinicId: "other-clinic" }))).status).toBe(403);
      expect((await POST(req({ ...valid, clinic_id: "other-clinic" }))).status).toBe(403);
      expect(createAppointmentMock).not.toHaveBeenCalled();
    });
  }
  it("未知のロールは403", async () => {
    stub([{ clinic_id: "c1", selected: true, role: "viewer" }], "active");
    expect((await POST(req(valid))).status).toBe(403);
    expect(createAppointmentMock).not.toHaveBeenCalled();
  });
  it("manager は active 医院で予約を作成できる", async () => {
    stub([{ clinic_id: "c1", selected: true, role: "manager" }], "active");
    expect((await POST(req(valid))).status).toBe(201);
  });
});
