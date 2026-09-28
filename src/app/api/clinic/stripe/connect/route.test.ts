import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const {
  getUserMock,
  fromMock,
  getClinicStripeAccountMock,
  upsertClinicStripeAccountMock,
  createConnectExpressAccountMock,
  createAccountOnboardingLinkMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  getClinicStripeAccountMock: vi.fn(),
  upsertClinicStripeAccountMock: vi.fn(),
  createConnectExpressAccountMock: vi.fn(),
  createAccountOnboardingLinkMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }),
}));

vi.mock("@/lib/charge-store", () => ({
  getClinicStripeAccount: getClinicStripeAccountMock,
  upsertClinicStripeAccount: upsertClinicStripeAccountMock,
}));

vi.mock("@/lib/stripe", () => ({
  createConnectExpressAccount: createConnectExpressAccountMock,
  createAccountOnboardingLink: createAccountOnboardingLinkMock,
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/clinic/stripe/connect", {
    method: "POST",
    headers: { Authorization: "Bearer test-token" },
    body: JSON.stringify(body),
  });
}

/** clinic_users→owner権限あり、clinics→承認済み(active)、を返す標準の許可済み経路 */
function stubAuthorizedFrom() {
  fromMock.mockImplementation((table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => {
        if (table === "clinic_users") return { data: { clinic_id: "clinic-1", role: "owner" }, error: null };
        if (table === "clinics") return { data: { status: "active" }, error: null };
        return { data: null, error: null };
      },
    };
    return chain;
  });
}

describe("POST /api/clinic/stripe/connect", () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
    getClinicStripeAccountMock.mockReset();
    upsertClinicStripeAccountMock.mockReset();
    createConnectExpressAccountMock.mockReset();
    createAccountOnboardingLinkMock.mockReset();
    consoleErrorSpy.mockClear();

    getUserMock.mockResolvedValue({ data: { user: { id: "user-1", email: "clinic@example.com" } }, error: null });
    stubAuthorizedFrom();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("Stripe側の処理が失敗した場合、レスポンスは従来通りだが、clinicIdとエラーをconsole.errorに出力する", async () => {
    const failure = new Error("STRIPE_SECRET_KEY is not set");
    getClinicStripeAccountMock.mockRejectedValue(failure);

    const res = await POST(makeRequest({ clinicId: "clinic-1" }));
    const json = await res.json();

    // レスポンス内容は変更しないこと
    expect(res.status).toBe(500);
    expect(json).toEqual({ error: String(failure) });

    // console.errorにclinicIdとエラーが出力されていること
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [, meta] = consoleErrorSpy.mock.calls[0];
    expect(meta).toMatchObject({ clinicId: "clinic-1", error: failure });

    // メールアドレス・トークン・認証ヘッダーが含まれていないこと
    const loggedText = JSON.stringify(consoleErrorSpy.mock.calls[0]);
    expect(loggedText).not.toContain("clinic@example.com");
    expect(loggedText).not.toContain("test-token");
  });

  it("成功時はconsole.errorを呼ばない", async () => {
    getClinicStripeAccountMock.mockResolvedValue({ stripeAccountId: "acct_1" });
    createAccountOnboardingLinkMock.mockResolvedValue("https://connect.stripe.com/setup/xxx");

    const res = await POST(makeRequest({ clinicId: "clinic-1" }));
    expect(res.status).toBe(200);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
