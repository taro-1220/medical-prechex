import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ from: fromMock }) }));

import { savePatientRegisteredEmail } from "./patient-email-store";

let lastSavedAt: string | null = null;
let readError: { code: string; message: string } | null = null;
let updateError: { code: string; message: string } | null = null;
const updateCalls: unknown[] = [];

function stub() {
  fromMock.mockImplementation((table: string) => {
    if (table !== "appointments") throw new Error(`unexpected table: ${table}`);
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (readError) return { data: null, error: readError };
            return { data: { patient_registered_email_at: lastSavedAt }, error: null };
          },
        }),
      }),
      update: (payload: unknown) => {
        updateCalls.push(payload);
        return { eq: async () => ({ error: updateError }) };
      },
    };
  });
}

describe("savePatientRegisteredEmail", () => {
  beforeEach(() => {
    fromMock.mockReset();
    updateCalls.length = 0;
    lastSavedAt = null;
    readError = null;
    updateError = null;
    stub();
  });

  it("appointmentsテーブルのみを参照する（patients台帳には触れない）", async () => {
    await savePatientRegisteredEmail("appt-1", "a@example.com");
    expect(fromMock).toHaveBeenCalledWith("appointments");
    expect(fromMock).not.toHaveBeenCalledWith("patients");
  });

  it("直前の保存から60秒未満ならrate_limited", async () => {
    lastSavedAt = new Date().toISOString();
    const res = await savePatientRegisteredEmail("appt-1", "a@example.com");
    expect(res).toEqual({ ok: false, reason: "rate_limited" });
    expect(updateCalls.length).toBe(0);
  });

  it("初回保存（記録なし）は成功する", async () => {
    const res = await savePatientRegisteredEmail("appt-1", "a@example.com");
    expect(res).toEqual({ ok: true });
    expect(updateCalls[0]).toMatchObject({ patient_registered_email: "a@example.com" });
  });

  it("読み取り時に列不存在(42703)ならunsupported", async () => {
    readError = { code: "42703", message: "column does not exist" };
    const res = await savePatientRegisteredEmail("appt-1", "a@example.com");
    expect(res).toEqual({ ok: false, reason: "unsupported" });
  });

  it("更新時に列不存在(42703)ならunsupported", async () => {
    updateError = { code: "42703", message: "column does not exist" };
    const res = await savePatientRegisteredEmail("appt-1", "a@example.com");
    expect(res).toEqual({ ok: false, reason: "unsupported" });
  });

  it("emailにnullを渡すと登録解除として保存する", async () => {
    await savePatientRegisteredEmail("appt-1", null);
    expect(updateCalls[0]).toMatchObject({ patient_registered_email: null });
  });
});
