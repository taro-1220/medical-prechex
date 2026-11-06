import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getUserMock, fromMock, getAppointmentByIdMock, sendConfirmationEmailAndRecordMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  getAppointmentByIdMock: vi.fn(),
  sendConfirmationEmailAndRecordMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { getUser: getUserMock }, from: fromMock }),
}));
vi.mock("@/lib/store", () => ({ getAppointmentById: getAppointmentByIdMock }));
vi.mock("@/lib/confirm-email", () => ({ sendConfirmationEmailAndRecord: sendConfirmationEmailAndRecordMock }));

import { POST } from "./route";

const VALID_ID = "11111111-1111-1111-1111-111111111111";

function makeRequest(authHeader?: string) {
  return new NextRequest(`http://localhost/api/clinic/appointments/${VALID_ID}/send-confirm-email`, {
    method: "POST",
    headers: authHeader ? { Authorization: authHeader } : undefined,
  });
}
function params() {
  return { params: Promise.resolve({ id: VALID_ID }) };
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

describe("POST /api/clinic/appointments/[id]/send-confirm-email", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
    getAppointmentByIdMock.mockReset();
    sendConfirmationEmailAndRecordMock.mockReset();
    clinicStatus = "active";
  });

  it("未認証なら401", async () => {
    const res = await POST(makeRequest(), params());
    expect(res.status).toBe(401);
    expect(sendConfirmationEmailAndRecordMock).not.toHaveBeenCalled();
  });

  it("他医院の予約なら403", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getAppointmentByIdMock.mockResolvedValue({ id: VALID_ID, clinicId: "clinic-1", status: "confirmed" });
    stubClinicMember(false);
    const res = await POST(makeRequest("Bearer t"), params());
    expect(res.status).toBe(403);
    expect(sendConfirmationEmailAndRecordMock).not.toHaveBeenCalled();
  });

  it("医院が未承認(pending_approval)なら403", async () => {
    clinicStatus = "pending_approval";
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getAppointmentByIdMock.mockResolvedValue({ id: VALID_ID, clinicId: "clinic-1", status: "confirmed" });
    stubClinicMember(true, "staff");
    const res = await POST(makeRequest("Bearer t"), params());
    expect(res.status).toBe(403);
    expect(sendConfirmationEmailAndRecordMock).not.toHaveBeenCalled();
  });

  it("キャンセル済みは409（送らない）", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getAppointmentByIdMock.mockResolvedValue({ id: VALID_ID, clinicId: "clinic-1", status: "cancelled" });
    stubClinicMember(true);
    sendConfirmationEmailAndRecordMock.mockResolvedValue({ ok: false, reason: "invalid_status" });
    const res = await POST(makeRequest("Bearer t"), params());
    expect(res.status).toBe(409);
  });

  it("スイッチOFF(disabled)は200でok:falseを返す（エラーにしない）", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getAppointmentByIdMock.mockResolvedValue({ id: VALID_ID, clinicId: "clinic-1", status: "confirmed" });
    stubClinicMember(true);
    sendConfirmationEmailAndRecordMock.mockResolvedValue({ ok: false, reason: "disabled" });
    const res = await POST(makeRequest("Bearer t"), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, reason: "disabled" });
  });

  it("所属医院かつ承認状態が有効なら送信し、sentAtを返す", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getAppointmentByIdMock.mockResolvedValue({ id: VALID_ID, clinicId: "clinic-1", status: "confirmed" });
    stubClinicMember(true);
    sendConfirmationEmailAndRecordMock.mockResolvedValue({ ok: true, sentAt: "2026-03-05T00:00:00.000Z" });
    const res = await POST(makeRequest("Bearer t"), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sentAt: "2026-03-05T00:00:00.000Z" });
  });
});
