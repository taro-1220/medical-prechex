import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const { requireClinicAccessMock, getOptionsMock, addOptionMock } = vi.hoisted(() => ({
  requireClinicAccessMock: vi.fn(),
  getOptionsMock: vi.fn(),
  addOptionMock: vi.fn(),
}));

vi.mock("@/lib/clinic-access", () => ({ requireClinicAccess: requireClinicAccessMock }));
vi.mock("@/lib/appointment-description-options-store", () => ({
  getAppointmentDescriptionOptions: getOptionsMock,
  addAppointmentDescriptionOption: addOptionMock,
}));

import { GET, POST } from "./route";

function ok() {
  return { ok: true as const, user: { id: "u1" }, clinicId: "clinic-1", role: "owner", clinicStatus: "active" };
}
function deny() {
  return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

describe("GET /api/clinic/appointment-description-options", () => {
  beforeEach(() => {
    requireClinicAccessMock.mockReset();
    getOptionsMock.mockReset();
  });

  it("clinic_id無しは400", async () => {
    const res = await GET(new NextRequest("http://localhost/api/clinic/appointment-description-options"));
    expect(res.status).toBe(400);
  });

  it("権限が無ければそのまま応答を返す", async () => {
    requireClinicAccessMock.mockResolvedValue(deny());
    const res = await GET(new NextRequest("http://localhost/api/clinic/appointment-description-options?clinic_id=clinic-1"));
    expect(res.status).toBe(403);
  });

  it("選択肢を返す", async () => {
    requireClinicAccessMock.mockResolvedValue(ok());
    getOptionsMock.mockResolvedValue(["初診", "相談"]);
    const res = await GET(new NextRequest("http://localhost/api/clinic/appointment-description-options?clinic_id=clinic-1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ options: ["初診", "相談"] });
  });
});

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/clinic/appointment-description-options", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/clinic/appointment-description-options", () => {
  beforeEach(() => {
    requireClinicAccessMock.mockReset();
    addOptionMock.mockReset();
  });

  it("clinicId無しは400", async () => {
    const res = await POST(makeRequest({ label: "相談" }));
    expect(res.status).toBe(400);
  });

  it("権限が無ければそのまま応答を返す（追加処理は呼ばない）", async () => {
    requireClinicAccessMock.mockResolvedValue(deny());
    const res = await POST(makeRequest({ clinicId: "clinic-1", label: "相談" }));
    expect(res.status).toBe(403);
    expect(addOptionMock).not.toHaveBeenCalled();
  });

  it("追加に成功したら選択肢一覧を返す", async () => {
    requireClinicAccessMock.mockResolvedValue(ok());
    addOptionMock.mockResolvedValue({ ok: true, options: ["初診", "相談", "ホワイトニング相談"] });
    const res = await POST(makeRequest({ clinicId: "clinic-1", label: "ホワイトニング相談" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ options: ["初診", "相談", "ホワイトニング相談"] });
  });

  it("invalidは400、duplicateは409、unsupportedは503", async () => {
    requireClinicAccessMock.mockResolvedValue(ok());
    addOptionMock.mockResolvedValue({ ok: false, reason: "invalid" });
    expect((await POST(makeRequest({ clinicId: "clinic-1", label: "" }))).status).toBe(400);
    addOptionMock.mockResolvedValue({ ok: false, reason: "duplicate" });
    expect((await POST(makeRequest({ clinicId: "clinic-1", label: "相談" }))).status).toBe(409);
    addOptionMock.mockResolvedValue({ ok: false, reason: "unsupported" });
    expect((await POST(makeRequest({ clinicId: "clinic-1", label: "相談" }))).status).toBe(503);
  });
});
