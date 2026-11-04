// 医院設定系 API: ロール(owner/manager/staff)と承認状態の強制を横断検証する。
// service role は RLS をバイパスするため、API 層の強制が唯一の防壁になる。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getUserMock, state } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  state: { role: "owner" as string | null, status: "active", writes: [] as string[] },
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: { getUser: getUserMock },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ["select", "eq", "in", "order", "limit"]) chain[m] = self;
      for (const m of ["update", "upsert", "insert", "delete"]) chain[m] = () => { state.writes.push(`${table}.${m}`); return chain; };
      chain.maybeSingle = async () => {
        if (table === "clinic_users") return { data: state.role ? { role: state.role, clinic_id: "c1" } : null, error: null };
        if (table === "clinics") return { data: { status: state.status }, error: null };
        return { data: null, error: null };
      };
      chain.single = chain.maybeSingle;
      chain.then = (r: (v: unknown) => void) => r({ data: [], error: null });
      return chain;
    },
  }),
}));
vi.mock("@/lib/store", () => ({
  getClinicCancelPolicySettings: vi.fn().mockResolvedValue({}),
  upsertClinicCancelPolicy: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/available-slots-store", () => ({ setClinicAutoNotifySetting: vi.fn() }));
vi.mock("@/lib/charge-store", () => ({
  getClinicStripeAccount: vi.fn().mockResolvedValue({ stripeAccountId: "acct_x" }),
  upsertClinicStripeAccount: vi.fn(),
}));
vi.mock("@/lib/stripe", () => ({
  createConnectExpressAccount: vi.fn(),
  createAccountOnboardingLink: vi.fn().mockResolvedValue("https://example.test/onboard"),
}));

import { PUT as profilePUT } from "./profile/route";
import { PUT as policyPUT } from "./policy/route";
import { PUT as notificationPUT } from "./notification/route";
import { PUT as slotPUT } from "./available-slot-settings/route";
import { PUT as cancelPolicyPUT } from "./cancel-policy/route";
import { PUT as templatesPUT } from "./templates/route";
import { POST as connectPOST } from "./stripe/connect/route";

type Handler = (req: NextRequest) => Promise<Response | undefined>;
const body = { clinicId: "c1", channel: "sms", body: "x", cancellationPolicy: "x", enabled: false, defaultMessage: "x" };

async function call(h: Handler, auth = true): Promise<Response> {
  const res = await h(new NextRequest("http://localhost/api/x", {
    method: "PUT",
    headers: auth ? { Authorization: "Bearer t" } : {},
    body: JSON.stringify(body),
  }));
  if (!res) throw new Error("handler returned no response");
  return res;
}

const SETTINGS: Array<[string, Handler]> = [
  ["profile", profilePUT], ["policy", policyPUT], ["notification", notificationPUT],
  ["available-slot-settings", slotPUT], ["cancel-policy", cancelPolicyPUT], ["templates", templatesPUT],
];

beforeEach(() => {
  state.role = "owner"; state.status = "active"; state.writes = [];
  getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "o@example.test" } }, error: null });
});

describe("医院設定の変更 API: owner/manager のみ・承認済み医院のみ", () => {
  for (const [name, h] of SETTINGS) {
    describe(name, () => {
      it("未認証は401", async () => {
        expect((await call(h, false)).status).toBe(401);
        expect(state.writes).toHaveLength(0);
      });
      it("非所属は403", async () => {
        state.role = null;
        expect((await call(h)).status).toBe(403);
        expect(state.writes).toHaveLength(0);
      });
      it("staff は403で何も書き込まない", async () => {
        state.role = "staff";
        expect((await call(h)).status).toBe(403);
        expect(state.writes).toHaveLength(0);
      });
      it("未知のロールは403", async () => {
        state.role = "viewer";
        expect((await call(h)).status).toBe(403);
        expect(state.writes).toHaveLength(0);
      });
      for (const status of ["pending_approval", "rejected"]) {
        it(`${status} の医院は owner でも403`, async () => {
          state.status = status;
          expect((await call(h)).status).toBe(403);
          expect(state.writes).toHaveLength(0);
        });
      }
      for (const role of ["owner", "manager"]) {
        it(`${role} × active は許可（認可で拒否されない）`, async () => {
          state.role = role;
          const s = (await call(h)).status;
          expect([401, 403]).not.toContain(s);
        });
      }
    });
  }
});

describe("Stripe Connect: owner のみ", () => {
  const connect = (auth = true) => connectPOST(new NextRequest("http://localhost/api/clinic/stripe/connect", {
    method: "POST", headers: auth ? { Authorization: "Bearer t" } : {}, body: JSON.stringify({ clinicId: "c1" }),
  }));
  it("未認証は401", async () => { expect((await connect(false)).status).toBe(401); });
  for (const role of ["manager", "staff", "viewer"]) {
    it(`${role} は403`, async () => { state.role = role; expect((await connect()).status).toBe(403); });
  }
  it("owner でも pending_approval は403", async () => { state.status = "pending_approval"; expect((await connect()).status).toBe(403); });
  it("owner × active は許可", async () => { expect((await connect()).status).toBe(200); });
});
