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

const COMPLETE_CLINIC_PROFILE = { clinic_display_name: "テスト医院", phone: "03-0000-0000", cancellation_policy: "前日までキャンセル無料" };
let clinicProfileOverride: Record<string, unknown> | null = COMPLETE_CLINIC_PROFILE;

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
        if (table === "clinic_profile") return { data: clinicProfileOverride, error: null };
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
    clinicProfileOverride = COMPLETE_CLINIC_PROFILE;
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

describe("POST /api/appointments: 連絡先（任意）と確認URLメールの自動送信", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    createAppointmentMock.mockResolvedValue({ id: "a1" });
    clinicProfileOverride = COMPLETE_CLINIC_PROFILE;
    delete process.env.ENABLE_REMINDER_SEND;
    delete process.env.RESEND_API_KEY;
  });

  it("電話・メールどちらも空でも201で作成できる", async () => {
    stub([{ clinic_id: "c1", selected: true }], "active");
    const res = await POST(req({ ...valid, phone: "", email: "" }));
    expect(res.status).toBe(201);
    expect(createAppointmentMock).toHaveBeenCalledTimes(1);
  });

  it("不正な形式のメールは400で、作成しない", async () => {
    stub([{ clinic_id: "c1", selected: true }], "active");
    const res = await POST(req({ ...valid, email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(createAppointmentMock).not.toHaveBeenCalled();
  });

  it("appointmentAtにタイムゾーンオフセットが無い場合は400で、作成しない", async () => {
    stub([{ clinic_id: "c1", selected: true }], "active");
    const res = await POST(req({ ...valid, appointmentAt: "2030-01-01T10:00:00" }));
    expect(res.status).toBe(400);
    expect(createAppointmentMock).not.toHaveBeenCalled();
  });

  it("備考(handoffNote)が500文字を超えると400で、作成しない", async () => {
    stub([{ clinic_id: "c1", selected: true }], "active");
    const res = await POST(req({ ...valid, handoffNote: "あ".repeat(501) }));
    expect(res.status).toBe(400);
    expect(createAppointmentMock).not.toHaveBeenCalled();
  });

  it("他院のスタッフID(staffId)を指定しても、担当無しとして作成される", async () => {
    stub([{ clinic_id: "c1", selected: true }], "active");
    const res = await POST(req({ ...valid, staffId: "other-clinic-staff" }));
    expect(res.status).toBe(201);
    expect(createAppointmentMock.mock.calls[0][0].staffId).toBeUndefined();
  });

  it("登録者(createdByName)はクライアント入力を無視し、認証済みユーザーのメールを使う", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "staff@example.com" } }, error: null });
    stub([{ clinic_id: "c1", selected: true }], "active");
    await POST(req({ ...valid, createdByName: "なりすまし" }));
    expect(createAppointmentMock.mock.calls[0][0].createdByName).toBe("staff@example.com");
  });

  it("appointmentAtに+09:00のオフセットがあれば201で作成できる", async () => {
    stub([{ clinic_id: "c1", selected: true }], "active");
    const res = await POST(req({ ...valid, appointmentAt: "2030-01-01T10:00:00+09:00" }));
    expect(res.status).toBe(201);
    expect(createAppointmentMock).toHaveBeenCalledTimes(1);
  });

  it("メールがあっても送信基盤が無効なら、作成は成功しemailSendStatusはdisabled", async () => {
    stub([{ clinic_id: "c1", selected: true }], "active");
    createAppointmentMock.mockResolvedValue({ id: "a1", email: "patient@example.com", status: "confirmation_pending", token: "tok1", clinicName: "テスト医院", appointmentAt: valid.appointmentAt });
    const res = await POST(req({ ...valid, email: "patient@example.com" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.emailSendStatus).toBe("disabled");
  });

  it("医院設定の必須項目（電話番号）が未設定なら400で作成しない", async () => {
    stub([{ clinic_id: "c1", selected: true }], "active");
    clinicProfileOverride = { ...COMPLETE_CLINIC_PROFILE, phone: "" };
    const res = await POST(req(valid));
    expect(res.status).toBe(400);
    expect(createAppointmentMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error).toContain("電話番号");
  });

  it("医院設定の必須項目が複数未設定なら、すべて列挙して400", async () => {
    stub([{ clinic_id: "c1", selected: true }], "active");
    clinicProfileOverride = { clinic_display_name: "", phone: "", cancellation_policy: "" };
    const res = await POST(req(valid));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("クリニック名");
    expect(body.error).toContain("電話番号");
    expect(body.error).toContain("キャンセルポリシー");
  });

  it("医院設定の必須項目がすべて設定済みなら201で作成できる", async () => {
    stub([{ clinic_id: "c1", selected: true }], "active");
    clinicProfileOverride = COMPLETE_CLINIC_PROFILE;
    const res = await POST(req(valid));
    expect(res.status).toBe(201);
    expect(createAppointmentMock).toHaveBeenCalledTimes(1);
  });
});
