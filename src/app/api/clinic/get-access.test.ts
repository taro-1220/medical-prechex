// 患者情報を返す GET の横断検証: 所属・ロール・承認状態・clinic_id 偽装。
// active のみ患者情報を返す。pending_approval は申請用の最小限(onboarding)のみ。rejected は不可。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getUserMock, db, calls } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  db: { members: [] as Array<{ clinic_id: string; role: string }>, statuses: {} as Record<string, string> },
  calls: [] as string[],
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: { getUser: getUserMock },
    from: (table: string) => {
      let eqClinic: string | null = null;
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.order = () => chain;
      chain.in = () => chain;
      chain.eq = (col: string, v: string) => { if (col === "clinic_id" || col === "id") eqClinic = v; return chain; };
      chain.maybeSingle = async () => {
        if (table === "clinic_users") {
          const m = db.members.find(x => x.clinic_id === eqClinic);
          return { data: m ?? null, error: null };
        }
        if (table === "clinics") return { data: eqClinic && db.statuses[eqClinic] ? { status: db.statuses[eqClinic] } : null, error: null };
        return { data: null, error: null };
      };
      chain.then = (r: (v: unknown) => void) => {
        if (table === "clinic_users") return r({ data: db.members, error: null });
        if (table === "clinics") return r({ data: Object.entries(db.statuses).map(([id, status]) => ({ id, status })), error: null });
        return r({ data: [], error: null });
      };
      return chain;
    },
  }),
}));
vi.mock("@/lib/store", () => ({
  getAllAppointments: vi.fn(async (ids: string[]) => { calls.push(`appointments:${ids.join(",")}`); return []; }),
  getClinicPatients: vi.fn(async (ids: string[]) => { calls.push(`patients:${ids.join(",")}`); return []; }),
  getClinicPatientDetail: vi.fn(async (_id: string, ids: string[]) => { calls.push(`detail:${ids.join(",")}`); return null; }),
  searchPatients: vi.fn(async (_q: string, ids: string[]) => { calls.push(`search:${ids.join(",")}`); return []; }),
}));
vi.mock("@/lib/charge-store", () => ({
  getClinicChargeDashboard: vi.fn(async () => ({})),
  getClinicStripeAccount: vi.fn(async () => ({ stripeAccountId: null })),
  upsertClinicStripeAccount: vi.fn(),
}));

import { GET as appointmentsGET } from "../appointments/route";
import { GET as patientsGET } from "./patients/route";
import { GET as patientDetailGET } from "./patients/[id]/route";
import { GET as searchGET } from "../patients/search/route";
import { GET as dashboardGET } from "./dashboard/route";
import { GET as onboardingGET } from "./onboarding/route";

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const r = (url: string, auth = true) => new NextRequest(`http://localhost${url}`, { headers: auth ? { Authorization: "Bearer t" } : {} });

const LISTS: Array<[string, (a: boolean) => Promise<Response | undefined>]> = [
  ["appointments", a => appointmentsGET(r("/api/appointments", a))],
  ["clinic/patients", a => patientsGET(r("/api/clinic/patients", a))],
  ["clinic/patients/[id]", a => patientDetailGET(r(`/api/clinic/patients/${UUID}`, a), { params: Promise.resolve({ id: UUID }) })],
  ["patients/search", a => searchGET(r("/api/patients/search?q=ab", a))],
];

beforeEach(() => {
  calls.length = 0;
  db.members = [{ clinic_id: "c1", role: "staff" }];
  db.statuses = { c1: "active" };
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
});

describe("患者情報を返す一覧系 GET", () => {
  for (const [name, call] of LISTS) {
    describe(name, () => {
      it("未認証は401", async () => { expect((await call(false))!.status).toBe(401); expect(calls).toHaveLength(0); });
      it("active 医院の staff は取得できる（active の clinic_id のみ渡る）", async () => {
        expect((await call(true))!.status).not.toBe(403);
        expect(calls[0]).toMatch(/:c1$/);
      });
      for (const status of ["pending_approval", "rejected"]) {
        it(`${status} のみ所属は403でデータ層に到達しない`, async () => {
          db.statuses = { c1: status };
          expect((await call(true))!.status).toBe(403);
          expect(calls).toHaveLength(0);
        });
      }
      it("active と pending/rejected が混在しても active の医院 ID だけがデータ層へ渡る", async () => {
        db.members = [{ clinic_id: "c1", role: "owner" }, { clinic_id: "c2", role: "owner" }, { clinic_id: "c3", role: "owner" }];
        db.statuses = { c1: "active", c2: "pending_approval", c3: "rejected" };
        await call(true);
        expect(calls[0]).toMatch(/:c1$/);
      });
      it("未知のロールのみの所属は403", async () => {
        db.members = [{ clinic_id: "c1", role: "viewer" }];
        expect((await call(true))!.status).toBe(403);
        expect(calls).toHaveLength(0);
      });
    });
  }
  it("所属が無いユーザーは従来どおり空（他院データは返らない）", async () => {
    db.members = [];
    const res = await appointmentsGET(r("/api/appointments"));
    expect(res.status).toBe(200);
    expect(calls[0]).toBe("appointments:");
  });
});

describe("dashboard / onboarding（clinic_id クエリ指定）", () => {
  it("dashboard: 他院の clinic_id 指定は403", async () => {
    expect((await dashboardGET(r("/api/clinic/dashboard?clinic_id=other")))!.status).toBe(403);
  });
  for (const status of ["pending_approval", "rejected"]) {
    it(`dashboard: ${status} は403`, async () => {
      db.statuses = { c1: status };
      expect((await dashboardGET(r("/api/clinic/dashboard?clinic_id=c1")))!.status).toBe(403);
    });
  }
  it("dashboard: active は取得できる", async () => {
    expect((await dashboardGET(r("/api/clinic/dashboard?clinic_id=c1")))!.status).toBe(200);
  });
  it("onboarding: pending_approval は申請に必要な最小限として閲覧できる", async () => {
    db.statuses = { c1: "pending_approval" };
    expect((await onboardingGET(r("/api/clinic/onboarding?clinic_id=c1")))!.status).toBe(200);
  });
  it("onboarding: rejected は403", async () => {
    db.statuses = { c1: "rejected" };
    expect((await onboardingGET(r("/api/clinic/onboarding?clinic_id=c1")))!.status).toBe(403);
  });
  it("onboarding: 他院の clinic_id 指定は403", async () => {
    expect((await onboardingGET(r("/api/clinic/onboarding?clinic_id=other")))!.status).toBe(403);
  });
});
