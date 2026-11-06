// getClinicCancelPolicySettings の insuranceNotificationConfirmedAt が、
// migration 023未適用（列不存在）でも例外を投げず安全側(null)で動くことを検証する。
// 既存の store.test.ts のモックには触れず、この検証専用に独立したモックを使う。
import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ from: fromMock }) }));

import { getClinicCancelPolicySettings } from "./store";

let notificationColumnResult: { data: unknown; error: { code: string; message: string } | null };

function stub() {
  fromMock.mockImplementation((table: string) => {
    if (table === "clinic_cancel_policies") {
      return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
    }
    if (table === "clinic_profile") {
      return {
        select: (cols: string) => ({
          eq: () => ({
            maybeSingle: async () => {
              if (cols.includes("cancel_policy_insurance_notification_confirmed_at")) {
                return notificationColumnResult;
              }
              return {
                data: { cancel_policy_enabled: true, cancel_policy_scope: "insurance", cancel_policy_insurance_acknowledged: true },
                error: null,
              };
            },
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
}

describe("getClinicCancelPolicySettings: insuranceNotificationConfirmedAtの安全側デフォルト", () => {
  beforeEach(() => {
    fromMock.mockReset();
    stub();
  });

  it("列に確認日時があればそのまま返す", async () => {
    notificationColumnResult = { data: { cancel_policy_insurance_notification_confirmed_at: "2026-06-01T00:00:00.000Z" }, error: null };
    const settings = await getClinicCancelPolicySettings("clinic-1");
    expect(settings.insuranceNotificationConfirmedAt).toBe("2026-06-01T00:00:00.000Z");
  });

  it("未確認(null)ならnull", async () => {
    notificationColumnResult = { data: { cancel_policy_insurance_notification_confirmed_at: null }, error: null };
    const settings = await getClinicCancelPolicySettings("clinic-1");
    expect(settings.insuranceNotificationConfirmedAt).toBeNull();
  });

  it("migration 023未適用（列不存在=42703）でも例外を投げず、安全側でnullを返す", async () => {
    notificationColumnResult = { data: null, error: { code: "42703", message: "column does not exist" } };
    const settings = await getClinicCancelPolicySettings("clinic-1");
    expect(settings.insuranceNotificationConfirmedAt).toBeNull();
    expect(settings.enabled).toBe(true); // 他のフィールドは正常に取得できている（全体を失敗させない）
  });
});
