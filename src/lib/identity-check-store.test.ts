import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ from: fromMock }) }));

import { isIdentityCheckLocked, recordIdentityCheckFailure, resetIdentityCheckFailures } from "./identity-check-store";

let lockedUntil: string | null = null;
let failCount = 0;
let readError: { code: string } | null = null;
const updateCalls: unknown[] = [];

function stub() {
  fromMock.mockImplementation((table: string) => {
    if (table !== "appointments") throw new Error(`unexpected table: ${table}`);
    return {
      select: (cols: string) => ({
        eq: () => ({
          maybeSingle: async () => {
            if (readError) return { data: null, error: readError };
            if (cols.includes("identity_check_locked_until")) return { data: { identity_check_locked_until: lockedUntil }, error: null };
            return { data: { identity_check_fail_count: failCount }, error: null };
          },
        }),
      }),
      update: (payload: unknown) => {
        updateCalls.push(payload);
        return { eq: async () => ({ error: null }) };
      },
    };
  });
}

describe("isIdentityCheckLocked", () => {
  beforeEach(() => { fromMock.mockReset(); readError = null; lockedUntil = null; stub(); });

  it("ロックが無ければfalse", async () => {
    expect(await isIdentityCheckLocked("a1")).toBe(false);
  });
  it("未来の日時がロックされていればtrue", async () => {
    lockedUntil = new Date(Date.now() + 60_000).toISOString();
    expect(await isIdentityCheckLocked("a1")).toBe(true);
  });
  it("過去の日時（失効済み）はfalse", async () => {
    lockedUntil = new Date(Date.now() - 60_000).toISOString();
    expect(await isIdentityCheckLocked("a1")).toBe(false);
  });
  it("列不存在(42703)でも例外を投げずfalse", async () => {
    readError = { code: "42703" };
    expect(await isIdentityCheckLocked("a1")).toBe(false);
  });
});

describe("recordIdentityCheckFailure", () => {
  beforeEach(() => { fromMock.mockReset(); readError = null; failCount = 0; updateCalls.length = 0; stub(); });

  it("5回目でロックする", async () => {
    failCount = 4;
    await recordIdentityCheckFailure("a1");
    expect(updateCalls[0]).toMatchObject({ identity_check_fail_count: 5, identity_check_locked_until: expect.any(String) });
  });
  it("4回目まではロックしない", async () => {
    failCount = 3;
    await recordIdentityCheckFailure("a1");
    expect(updateCalls[0]).toEqual({ identity_check_fail_count: 4 });
  });
  it("列不存在(42703)でも例外を投げない", async () => {
    readError = { code: "42703" };
    await expect(recordIdentityCheckFailure("a1")).resolves.toBeUndefined();
    expect(updateCalls.length).toBe(0);
  });
});

describe("resetIdentityCheckFailures", () => {
  beforeEach(() => { fromMock.mockReset(); updateCalls.length = 0; stub(); });

  it("失敗回数とロックをクリアする", async () => {
    await resetIdentityCheckFailures("a1");
    expect(updateCalls[0]).toEqual({ identity_check_fail_count: 0, identity_check_locked_until: null });
  });
});
