import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { authenticateRequestMock, getActiveClinicIdsForUserMock, searchPatientsMock } = vi.hoisted(() => ({
  authenticateRequestMock: vi.fn(),
  getActiveClinicIdsForUserMock: vi.fn(),
  searchPatientsMock: vi.fn(),
}));

vi.mock("@/lib/clinic-access", () => ({
  authenticateRequest: authenticateRequestMock,
  getActiveClinicIdsForUser: getActiveClinicIdsForUserMock,
}));

vi.mock("@/lib/store", () => ({ searchPatients: searchPatientsMock }));

import { GET } from "./route";

function makeRequest(q: string) {
  return new NextRequest(`http://localhost/api/patients/search?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: "Bearer t" },
  });
}

/** 他クリニックの患者が混ざらないことを、store層と同じ条件（clinic_idの絞り込み）で確認する */
const PATIENTS_BY_CLINIC: Record<string, { id: string; name: string; phone: string; email: string }[]> = {
  "clinic-1": [{ id: "patient-1", name: "山田太郎", phone: "", email: "" }],
  "clinic-2": [{ id: "patient-9", name: "山田花子", phone: "", email: "" }],
};

describe("GET /api/patients/search", () => {
  beforeEach(() => {
    authenticateRequestMock.mockReset();
    getActiveClinicIdsForUserMock.mockReset();
    searchPatientsMock.mockReset();
    authenticateRequestMock.mockResolvedValue({ id: "u1" });
    getActiveClinicIdsForUserMock.mockResolvedValue({ ok: true, blocked: false, clinicIds: ["clinic-1"] });
    searchPatientsMock.mockImplementation(async (q: string, clinicIds: string[]) =>
      clinicIds.flatMap((cid) => (PATIENTS_BY_CLINIC[cid] ?? []).filter((p) => p.name.includes(q))),
    );
  });

  it("未認証なら401（検索しない）", async () => {
    authenticateRequestMock.mockResolvedValue(null);
    const res = await GET(makeRequest("山田"));
    expect(res.status).toBe(401);
    expect(searchPatientsMock).not.toHaveBeenCalled();
  });

  it("承認前・却下の医院は403（検索しない）", async () => {
    getActiveClinicIdsForUserMock.mockResolvedValue({ ok: true, blocked: true, clinicIds: [] });
    const res = await GET(makeRequest("山田"));
    expect(res.status).toBe(403);
    expect(searchPatientsMock).not.toHaveBeenCalled();
  });

  it("所属が取れなければその応答をそのまま返す", async () => {
    getActiveClinicIdsForUserMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    const res = await GET(makeRequest("山田"));
    expect(res.status).toBe(403);
    expect(searchPatientsMock).not.toHaveBeenCalled();
  });

  it("1文字では検索せず空配列を返す", async () => {
    const res = await GET(makeRequest("山"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(searchPatientsMock).not.toHaveBeenCalled();
  });

  it("一致する患者があれば配列で返す", async () => {
    const res = await GET(makeRequest("山田"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "patient-1", name: "山田太郎", phone: "", email: "" }]);
  });

  it("一致しなければ空配列（0件）を返す", async () => {
    const res = await GET(makeRequest("佐藤"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("他クリニックの患者は返らない（clinic_idの絞り込みはサーバー側で行う）", async () => {
    const res = await GET(makeRequest("山田"));
    const body = await res.json();
    expect(searchPatientsMock).toHaveBeenCalledWith("山田", ["clinic-1"]);
    expect(body.map((p: { id: string }) => p.id)).toEqual(["patient-1"]);
    expect(body.map((p: { id: string }) => p.id)).not.toContain("patient-9");
  });

  it("検索が失敗したら500（画面側でエラー表示できるようにする）", async () => {
    searchPatientsMock.mockRejectedValue(new Error("db error"));
    const res = await GET(makeRequest("山田"));
    expect(res.status).toBe(500);
  });
});
