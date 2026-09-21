import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const signUpMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: { signUp: signUpMock },
    from: fromMock,
  }),
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/clinic/signup", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

type TableConfig = { error?: { message: string } };

function stubTables(tables: Record<string, TableConfig>) {
  const calls: { table: string; action: string }[] = [];
  fromMock.mockImplementation((table: string) => {
    const cfg = tables[table] ?? {};
    return {
      insert() {
        calls.push({ table, action: "insert" });
        const error = cfg.error ?? null;
        return {
          select() {
            return {
              single: async () =>
                error ? { data: null, error } : { data: { id: "clinic-1" }, error: null },
            };
          },
          then(resolve: (v: { data: null; error: typeof error }) => unknown, reject?: unknown) {
            return Promise.resolve({ data: null, error }).then(resolve, reject as never);
          },
        };
      },
      delete() {
        return {
          eq: async () => {
            calls.push({ table, action: "delete" });
            return { error: null };
          },
        };
      },
    };
  });
  return calls;
}

const validBody = {
  clinicName: "テスト歯科",
  directorName: "テスト太郎",
  email: "test@example.com",
  password: "password123",
};

describe("POST /api/clinic/signup", () => {
  beforeEach(() => {
    signUpMock.mockReset();
    fromMock.mockReset();
  });

  it("既に登録済みのメールで再サインアップした場合、エラーを返しclinics/clinic_profileを作成しない", async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: "fake-id", identities: [] } },
      error: null,
    });
    const calls = stubTables({});

    const res = await POST(makeRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("email_already_registered");
    expect(calls.filter((c) => c.action === "insert")).toHaveLength(0);
  });

  it("clinic_profileのinsertが失敗した場合、先に作成したclinicsを削除する", async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: "user-1", identities: [{ id: "identity-1" }] } },
      error: null,
    });
    const calls = stubTables({
      clinic_profile: { error: { message: "profile insert failed" } },
    });

    const res = await POST(makeRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("profile insert failed");
    expect(calls).toContainEqual({ table: "clinics", action: "delete" });
    expect(calls.filter((c) => c.table === "clinic_users")).toHaveLength(0);
  });

  it("正常系: すべて成功した場合201を返し、削除は発生しない", async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: "user-1", identities: [{ id: "identity-1" }] } },
      error: null,
    });
    const calls = stubTables({});

    const res = await POST(makeRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(calls.map((c) => c.table)).toEqual(["clinics", "clinic_profile", "clinic_users"]);
    expect(calls.filter((c) => c.action === "delete")).toHaveLength(0);
  });
});
