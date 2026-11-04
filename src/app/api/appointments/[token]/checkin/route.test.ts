import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getUserMock, fromMock, getAppointmentMock, updateStatusMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  getAppointmentMock: vi.fn(),
  updateStatusMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { getUser: getUserMock }, from: fromMock }),
}));

vi.mock("@/lib/store", () => ({
  getAppointment: getAppointmentMock,
  updateStatus: updateStatusMock,
}));

import { POST } from "./route";

function makeRequest(authHeader?: string) {
  return new NextRequest("http://localhost/api/appointments/tok1/checkin", {
    method: "POST",
    headers: authHeader ? { Authorization: authHeader } : undefined,
  });
}

function params() {
  return { params: Promise.resolve({ token: "tok1" }) };
}

let clinicStatus = "active";
function stubClinicMember(matches: boolean, role: string = "staff") {
  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => {
        if (table === "clinics") return { data: { status: clinicStatus }, error: null };
        return matches ? { data: { clinic_id: "clinic-1", role }, error: null } : { data: null, error: null };
      },
    };
    return chain;
  });
}

describe("POST /api/appointments/[token]/checkin", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
    clinicStatus = "active";
    getAppointmentMock.mockReset();
    updateStatusMock.mockReset();
  });

  it("未認証なら401", async () => {
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(401);
    expect(updateStatusMock).not.toHaveBeenCalled();
  });

  it("トークンが無効なら401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    const res = await POST(makeRequest("Bearer bad"), params());
    expect(res.status).toBe(401);
  });

  it("所属していない医院の予約なら403", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getAppointmentMock.mockResolvedValue({ id: "a1", token: "tok1", status: "confirmed", clinicId: "clinic-1" });
    stubClinicMember(false);
    const res = await POST(makeRequest("Bearer t"), params());
    expect(res.status).toBe(403);
    expect(updateStatusMock).not.toHaveBeenCalled();
  });

  it("所属医院の予約でstatus=confirmedなら来院受付できる", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getAppointmentMock.mockResolvedValue({ id: "a1", token: "tok1", status: "confirmed", clinicId: "clinic-1" });
    stubClinicMember(true);
    updateStatusMock.mockResolvedValue(true);
    const res = await POST(makeRequest("Bearer t"), params());
    expect(res.status).toBe(200);
    expect(updateStatusMock).toHaveBeenCalledWith("tok1", "checked_in", expect.any(Object));
  });

  it("status=confirmation_pendingなど不正な遷移は409", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getAppointmentMock.mockResolvedValue({ id: "a1", token: "tok1", status: "confirmation_pending", clinicId: "clinic-1" });
    stubClinicMember(true);
    const res = await POST(makeRequest("Bearer t"), params());
    expect(res.status).toBe(409);
    expect(updateStatusMock).not.toHaveBeenCalled();
  });

  it("医院に紐づかない予約（clinicId無し）なら403", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getAppointmentMock.mockResolvedValue({ id: "a1", token: "tok1", status: "confirmed", clinicId: undefined });
    const res = await POST(makeRequest("Bearer t"), params());
    expect(res.status).toBe(403);
    expect(updateStatusMock).not.toHaveBeenCalled();
  });

  it("未知のロール値は全権限なしで403（fail-closed）", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getAppointmentMock.mockResolvedValue({ id: "a1", token: "tok1", status: "confirmed", clinicId: "clinic-1" });
    stubClinicMember(true, "viewer");
    const res = await POST(makeRequest("Bearer ok"), params());
    expect(res.status).toBe(403);
    expect(updateStatusMock).not.toHaveBeenCalled();
  });

  it("staff でも実行できる（受付・完了は staff に許可）", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getAppointmentMock.mockResolvedValue({ id: "a1", token: "tok1", status: "confirmed", clinicId: "clinic-1" });
    updateStatusMock.mockResolvedValue(true);
    stubClinicMember(true, "staff");
    const res = await POST(makeRequest("Bearer ok"), params());
    expect(res.status).toBe(200);
  });

  for (const st of ["pending_approval", "rejected"]) {
    it(`${st} の医院は staff でも通常業務として403（状態を更新しない）`, async () => {
      clinicStatus = st;
      getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
      getAppointmentMock.mockResolvedValue({ id: "a1", token: "tok1", status: "confirmed", clinicId: "clinic-1" });
      stubClinicMember(true, "staff");
      const res = await POST(makeRequest("Bearer ok"), params());
      expect(res.status).toBe(403);
      expect(updateStatusMock).not.toHaveBeenCalled();
    });
  }
});
