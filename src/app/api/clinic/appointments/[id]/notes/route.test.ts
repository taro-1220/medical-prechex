import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { authenticateRequestMock, authorizeClinicAccessMock, getAppointmentByIdMock, addAppointmentNoteMock, listAppointmentNotesMock } = vi.hoisted(() => ({
  authenticateRequestMock: vi.fn(),
  authorizeClinicAccessMock: vi.fn(),
  getAppointmentByIdMock: vi.fn(),
  addAppointmentNoteMock: vi.fn(),
  listAppointmentNotesMock: vi.fn(),
}));

vi.mock("@/lib/clinic-access", () => ({
  authenticateRequest: authenticateRequestMock,
  authorizeClinicAccess: authorizeClinicAccessMock,
}));

vi.mock("@/lib/store", () => ({
  getAppointmentById: getAppointmentByIdMock,
}));

vi.mock("@/lib/appointment-notes-store", () => ({
  addAppointmentNote: addAppointmentNoteMock,
  listAppointmentNotes: listAppointmentNotesMock,
}));

import { GET, POST } from "./route";

const VALID_ID = "11111111-1111-1111-1111-111111111111";

function allow() {
  return { ok: true as const, user: { id: "u1" }, clinicId: "clinic-1", role: "owner", clinicStatus: "active" };
}
function deny() {
  return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

function makeGetRequest() {
  return new NextRequest(`http://localhost/api/clinic/appointments/${VALID_ID}/notes`, {
    headers: { Authorization: "Bearer t" },
  });
}
function makePostRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/clinic/appointments/${VALID_ID}/notes`, {
    method: "POST",
    headers: { Authorization: "Bearer t" },
    body: JSON.stringify(body),
  });
}
function params() {
  return { params: Promise.resolve({ id: VALID_ID }) };
}

describe("GET /api/clinic/appointments/[id]/notes", () => {
  beforeEach(() => {
    authenticateRequestMock.mockReset();
    authorizeClinicAccessMock.mockReset();
    getAppointmentByIdMock.mockReset();
    listAppointmentNotesMock.mockReset();
    authenticateRequestMock.mockResolvedValue({ id: "u1", email: "staff@example.com" });
  });

  it("未認証なら401", async () => {
    authenticateRequestMock.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), params());
    expect(res.status).toBe(401);
  });

  it("所属していない医院なら403", async () => {
    getAppointmentByIdMock.mockResolvedValue({ id: VALID_ID, clinicId: "clinic-1" });
    authorizeClinicAccessMock.mockResolvedValue(deny());
    const res = await GET(makeGetRequest(), params());
    expect(res.status).toBe(403);
  });

  it("古い順の一覧を返す", async () => {
    getAppointmentByIdMock.mockResolvedValue({ id: VALID_ID, clinicId: "clinic-1" });
    authorizeClinicAccessMock.mockResolvedValue(allow());
    listAppointmentNotesMock.mockResolvedValue([{ id: "n1" }]);
    const res = await GET(makeGetRequest(), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notes: [{ id: "n1" }] });
  });
});

describe("POST /api/clinic/appointments/[id]/notes", () => {
  beforeEach(() => {
    authenticateRequestMock.mockReset();
    authorizeClinicAccessMock.mockReset();
    getAppointmentByIdMock.mockReset();
    addAppointmentNoteMock.mockReset();
    authenticateRequestMock.mockResolvedValue({ id: "u1", email: "staff@example.com" });
    getAppointmentByIdMock.mockResolvedValue({ id: VALID_ID, clinicId: "clinic-1" });
    authorizeClinicAccessMock.mockResolvedValue(allow());
  });

  it("未認証なら401", async () => {
    authenticateRequestMock.mockResolvedValue(null);
    const res = await POST(makePostRequest({ body: "備考" }), params());
    expect(res.status).toBe(401);
  });

  it("権限が無ければ403", async () => {
    authorizeClinicAccessMock.mockResolvedValue(deny());
    const res = await POST(makePostRequest({ body: "備考" }), params());
    expect(res.status).toBe(403);
    expect(addAppointmentNoteMock).not.toHaveBeenCalled();
  });

  it("1文字未満（空文字）は400", async () => {
    addAppointmentNoteMock.mockResolvedValue({ ok: false, reason: "invalid" });
    const res = await POST(makePostRequest({ body: "" }), params());
    expect(res.status).toBe(400);
  });

  it("500文字を超えると400", async () => {
    addAppointmentNoteMock.mockResolvedValue({ ok: false, reason: "invalid" });
    const res = await POST(makePostRequest({ body: "あ".repeat(501) }), params());
    expect(res.status).toBe(400);
  });

  it("クライアントから created_by_name を渡しても無視し、認証ユーザーのメールで記録する", async () => {
    addAppointmentNoteMock.mockResolvedValue({ ok: true, note: { id: "n1" } });
    const res = await POST(makePostRequest({ body: "追記します", created_by_name: "なりすまし" }), params());
    expect(res.status).toBe(200);
    expect(addAppointmentNoteMock).toHaveBeenCalledWith(VALID_ID, "clinic-1", "note", "追記します", "staff@example.com");
  });

  it("migration未適用（unsupported）は503", async () => {
    addAppointmentNoteMock.mockResolvedValue({ ok: false, reason: "unsupported" });
    const res = await POST(makePostRequest({ body: "追記します" }), params());
    expect(res.status).toBe(503);
  });
});
