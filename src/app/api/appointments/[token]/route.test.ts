// 汎用PATCHはトークンのみで任意のstatusに変更できてしまう脆弱性があったため廃止。
// スタッフ操作は認証付きの専用エンドポイント（checkin・complete）へ移行した。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getAppointmentForDisplayMock, recordConfirmPageFirstViewedMock } = vi.hoisted(() => ({
  getAppointmentForDisplayMock: vi.fn(),
  recordConfirmPageFirstViewedMock: vi.fn(),
}));

vi.mock("@/lib/store", () => ({
  getAppointmentForDisplay: getAppointmentForDisplayMock,
  recordConfirmPageFirstViewed: recordConfirmPageFirstViewedMock,
}));

import * as route from "./route";
const { GET } = route;

function params() {
  return { params: Promise.resolve({ token: "tok1" }) };
}

describe("PATCH /api/appointments/[token]", () => {
  it("汎用PATCHは廃止されている（トークンのみでの状態変更を防ぐため）", () => {
    expect((route as Record<string, unknown>).PATCH).toBeUndefined();
  });
});

describe("GET /api/appointments/[token]", () => {
  beforeEach(() => {
    getAppointmentForDisplayMock.mockReset();
    recordConfirmPageFirstViewedMock.mockReset();
    recordConfirmPageFirstViewedMock.mockResolvedValue(undefined);
  });

  it("予約が無ければ404で、記録は呼ばない", async () => {
    getAppointmentForDisplayMock.mockResolvedValue(undefined);
    const res = await GET(new NextRequest("http://localhost/api/appointments/tok1"), params());
    expect(res.status).toBe(404);
    expect(recordConfirmPageFirstViewedMock).not.toHaveBeenCalled();
  });

  it("予約があれば、確認ページを開いた記録を呼ぶ", async () => {
    getAppointmentForDisplayMock.mockResolvedValue({
      id: "appt-1",
      status: "confirmation_pending",
      appointmentAt: "2099-01-01T00:00:00.000Z",
    });
    const res = await GET(new NextRequest("http://localhost/api/appointments/tok1"), params());
    expect(res.status).toBe(200);
    expect(recordConfirmPageFirstViewedMock).toHaveBeenCalledWith("appt-1");
  });
});
