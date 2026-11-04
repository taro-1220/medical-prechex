import { describe, it, expect } from "vitest";
import { vi } from "vitest";
vi.mock("./supabase", () => ({ getSupabase: () => ({}) }));
import { roleHasPermission, type ClinicPermission } from "./clinic-access";

const PERMS: ClinicPermission[] = ["view", "operate", "reservation", "settings", "stripe"];

describe("roleHasPermission: 権限マトリクス", () => {
  const expected: Record<string, ClinicPermission[]> = {
    owner: ["view", "operate", "reservation", "settings", "stripe"],
    manager: ["view", "operate", "reservation", "settings"],
    staff: ["view", "operate", "reservation"],
  };
  for (const [role, allowed] of Object.entries(expected)) {
    for (const p of PERMS) {
      it(`${role} × ${p} = ${allowed.includes(p)}`, () => {
        expect(roleHasPermission(role, p)).toBe(allowed.includes(p));
      });
    }
  }
  it("未知のロール・null・undefined は全権限なし（fail-closed）", () => {
    for (const r of ["viewer", "", "OWNER", null, undefined, 1]) {
      for (const p of PERMS) expect(roleHasPermission(r, p)).toBe(false);
    }
  });
});
