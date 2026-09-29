// confirmWithConsent: Medipre利用規約への同意記録（terms_version, terms_agreed_at）を検証する。
// getSupabase()をモックし、appointments/clinic_profile/clinic_cancel_policies/consent_logs
// への実際の呼び出し内容をテーブルごとに記録して確認する（ネットワークには一切触れない）。
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase", () => ({
  getSupabase: () => mockClient(),
}));

import { confirmWithConsent } from "./store";
import { TERMS_VERSION } from "./terms";

const BASE_APPOINTMENT_ROW = {
  id: "appt-1",
  token: "token-1",
  clinic_name: "検収クリニック",
  patient_name: "山田太郎",
  phone: "",
  email: "",
  communication_channel: "manual",
  appointment_at: "2026-10-01T00:00:00Z",
  description: "定期検診",
  cancellation_policy: "前日までキャンセル無料",
  status: "confirmation_pending",
  consent_at: null,
  clinic_id: "clinic-1",
  patient_id: "patient-1",
  created_at: "2026-09-01T00:00:00Z",
  treatment_category: "private",
  cancel_policy_applied: false,
  cancel_policy_snapshot: null,
  base_amount: null,
  card_registration_required: false,
};

let insertCalls: { table: string; payload: unknown }[] = [];
let appointmentRow: Record<string, unknown> = BASE_APPOINTMENT_ROW;

function mockClient() {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => {
                  if (table === "appointments") return { data: appointmentRow, error: null };
                  if (table === "clinic_profile") return { data: null, error: null };
                  return { data: null, error: null };
                },
                // clinic_cancel_policies は maybeSingle を呼ばず、配列取得のみ
                then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
                  Promise.resolve({ data: [], error: null }).then(resolve),
              };
            },
          };
        },
        insert(payload: unknown) {
          insertCalls.push({ table, payload });
          return { then: (resolve: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve) };
        },
        update() {
          return {
            eq() {
              return { select: async () => ({ data: [{ id: "appt-1" }], error: null }) };
            },
          };
        },
      };
    },
  };
}

describe("confirmWithConsent: 利用規約の同意記録", () => {
  beforeEach(() => {
    insertCalls = [];
    appointmentRow = BASE_APPOINTMENT_ROW;
  });

  it("consent_logsにterms_versionとterms_agreed_atが記録される", async () => {
    const ok = await confirmWithConsent("token-1");
    expect(ok).toBe(true);

    const consentLogInsert = insertCalls.find((c) => c.table === "consent_logs");
    expect(consentLogInsert).toBeDefined();
    const payload = consentLogInsert!.payload as Record<string, unknown>;
    expect(payload.terms_version).toBe(TERMS_VERSION);
    expect(typeof payload.terms_agreed_at).toBe("string");
  });

  it("キャンセルポリシー非適用の予約でも、利用規約の同意は記録される", async () => {
    appointmentRow = { ...BASE_APPOINTMENT_ROW, cancel_policy_applied: false };
    await confirmWithConsent("token-1");
    const consentLogInsert = insertCalls.find((c) => c.table === "consent_logs");
    expect((consentLogInsert!.payload as Record<string, unknown>).terms_version).toBe(TERMS_VERSION);
  });

  it("既存のpolicy_text等の記録内容は変わらない", async () => {
    await confirmWithConsent("token-1");
    const consentLogInsert = insertCalls.find((c) => c.table === "consent_logs");
    const payload = consentLogInsert!.payload as Record<string, unknown>;
    expect(payload.policy_text).toBe(BASE_APPOINTMENT_ROW.cancellation_policy);
    expect(payload.patient_name).toBe(BASE_APPOINTMENT_ROW.patient_name);
  });
});
