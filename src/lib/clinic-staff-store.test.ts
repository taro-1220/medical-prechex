import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ from: fromMock }) }));

import { listClinicStaff, addClinicStaffMember, deactivateClinicStaffMember } from "./clinic-staff-store";

let rows: Record<string, unknown>[] = [];
let listError: { code: string; message: string } | null = null;
let insertError: { code: string; message: string } | null = null;
let insertedRow: Record<string, unknown> | null = null;
const updateCalls: { table: string; payload: unknown }[] = [];

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "staff-1",
    clinic_id: "clinic-1",
    name: "受付担当",
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function stub() {
  fromMock.mockImplementation((table: string) => {
    if (table !== "clinic_staff_members") throw new Error(`unexpected table: ${table}`);
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({ order: async () => (listError ? { data: null, error: listError } : { data: rows, error: null }) }),
          order: async () => (listError ? { data: null, error: listError } : { data: rows, error: null }),
          maybeSingle: async () => (listError ? { data: null, error: listError } : { data: rows[0] ?? null, error: null }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => (insertError ? { data: null, error: insertError } : { data: insertedRow, error: null }),
        }),
      }),
      update: (payload: unknown) => {
        updateCalls.push({ table, payload });
        return { eq: () => ({ eq: async () => ({ error: null }) }) };
      },
    };
  });
}

describe("listClinicStaff", () => {
  beforeEach(() => {
    fromMock.mockReset();
    rows = [];
    listError = null;
    updateCalls.length = 0;
    stub();
  });

  it("スタッフ一覧を返す", async () => {
    rows = [makeRow()];
    expect(await listClinicStaff("clinic-1")).toEqual([
      { id: "staff-1", clinicId: "clinic-1", name: "受付担当", active: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    ]);
  });

  it("migration未適用(42P01)なら空配列", async () => {
    listError = { code: "42P01", message: "relation does not exist" };
    expect(await listClinicStaff("clinic-1")).toEqual([]);
  });
});

describe("addClinicStaffMember", () => {
  beforeEach(() => {
    fromMock.mockReset();
    insertError = null;
    insertedRow = makeRow();
    stub();
  });

  it("1〜40文字で登録できる", async () => {
    const result = await addClinicStaffMember("clinic-1", "  受付担当  ");
    expect(result).toEqual({ ok: true, member: { id: "staff-1", clinicId: "clinic-1", name: "受付担当", active: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" } });
  });

  it("0文字・41文字以上はinvalid", async () => {
    expect(await addClinicStaffMember("clinic-1", "  ")).toEqual({ ok: false, reason: "invalid" });
    expect(await addClinicStaffMember("clinic-1", "あ".repeat(41))).toEqual({ ok: false, reason: "invalid" });
  });

  it("migration未適用はunsupported", async () => {
    insertError = { code: "42P01", message: "relation does not exist" };
    expect(await addClinicStaffMember("clinic-1", "受付担当")).toEqual({ ok: false, reason: "unsupported" });
  });
});

describe("deactivateClinicStaffMember", () => {
  beforeEach(() => {
    fromMock.mockReset();
    updateCalls.length = 0;
    stub();
  });

  it("clinic_staff_membersのactiveのみを更新する（appointmentsには触れない）", async () => {
    const ok = await deactivateClinicStaffMember("clinic-1", "staff-1");
    expect(ok).toBe(true);
    expect(updateCalls).toEqual([{ table: "clinic_staff_members", payload: expect.objectContaining({ active: false }) }]);
  });
});
