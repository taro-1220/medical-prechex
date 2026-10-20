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
  return new NextRequest("http://localhost/api/appointments/tok1/complete", {
    method: "POST",
    headers: authHeader ? { Authorization: authHeader } : undefined,
  });
}

function params() {
  return { params: Promise.resolve({ token: "tok1" }) };
}

function stubClinicMember(matches: boolean) {
  fromMock.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () =>
            matches
              ? { data: { clinic_id: "clinic-1" }, error: null }
              : { data: null, error: null },
        }),
      }),
    }),
  }));
}

describe("POST /api/appointments/[token]/complete", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
    getAppointmentMock.mockReset();
    updateStatusMock.mockReset();
  });

  it("未認証なら401", async () => {
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(401);
    expect(updateStatusMock).not.toHaveBeenCalled();
  });

  it("所属していない医院の予約なら403", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getAppointmentMock.mockResolvedValue({ id: "a1", token: "tok1", status: "checked_in", clinicId: "clinic-1" });
    stubClinicMember(false);
    const res = await POST(makeRequest("Bearer t"), params());
    expect(res.status).toBe(403);
    expect(updateStatusMock).not.toHaveBeenCalled();
  });

  it("所属医院の予約でstatus=checked_inなら診察完了にできる", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getAppointmentMock.mockResolvedValue({ id: "a1", token: "tok1", status: "checked_in", clinicId: "clinic-1" });
    stubClinicMember(true);
    updateStatusMock.mockResolvedValue(true);
    const res = await POST(makeRequest("Bearer t"), params());
    expect(res.status).toBe(200);
    expect(updateStatusMock).toHaveBeenCalledWith("tok1", "completed");
  });

  it("status=confirmedなど来院前の予約を直接完了にするのは409（キャンセル料回避の不正遷移を防ぐ）", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getAppointmentMock.mockResolvedValue({ id: "a1", token: "tok1", status: "confirmed", clinicId: "clinic-1" });
    stubClinicMember(true);
    const res = await POST(makeRequest("Bearer t"), params());
    expect(res.status).toBe(409);
    expect(updateStatusMock).not.toHaveBeenCalled();
  });

  it("予約が見つからなければ404", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getAppointmentMock.mockResolvedValue(undefined);
    const res = await POST(makeRequest("Bearer t"), params());
    expect(res.status).toBe(404);
  });
});
