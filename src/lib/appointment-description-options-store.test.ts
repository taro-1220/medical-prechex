import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ from: fromMock }) }));

import { getAppointmentDescriptionOptions, addAppointmentDescriptionOption } from "./appointment-description-options-store";
import { DEFAULT_APPOINTMENT_DESCRIPTION_OPTIONS } from "./appointment-description-options";

let storedOptions: string[] | null = null;
let selectError: { code: string; message: string } | null = null;
let upsertError: { code: string; message: string } | null = null;
const upsertCalls: unknown[] = [];

function stub() {
  fromMock.mockImplementation((table: string) => {
    if (table !== "clinic_profile") throw new Error(`unexpected table: ${table}`);
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (selectError) return { data: null, error: selectError };
            return { data: { appointment_description_options: storedOptions }, error: null };
          },
        }),
      }),
      upsert: (payload: unknown) => {
        upsertCalls.push(payload);
        return Promise.resolve({ error: upsertError });
      },
    };
  });
}

describe("getAppointmentDescriptionOptions", () => {
  beforeEach(() => {
    fromMock.mockReset();
    storedOptions = null;
    selectError = null;
    stub();
  });

  it("未設定(null)なら初期の選択肢を返す", async () => {
    storedOptions = null;
    expect(await getAppointmentDescriptionOptions("clinic-1")).toEqual(DEFAULT_APPOINTMENT_DESCRIPTION_OPTIONS);
  });

  it("設定済みならその選択肢を返す", async () => {
    storedOptions = ["初診", "ホワイトニング相談"];
    expect(await getAppointmentDescriptionOptions("clinic-1")).toEqual(["初診", "ホワイトニング相談"]);
  });

  it("migration未適用(42703)なら初期の選択肢にフォールバックする", async () => {
    selectError = { code: "42703", message: "column does not exist" };
    expect(await getAppointmentDescriptionOptions("clinic-1")).toEqual(DEFAULT_APPOINTMENT_DESCRIPTION_OPTIONS);
  });
});

describe("addAppointmentDescriptionOption", () => {
  beforeEach(() => {
    fromMock.mockReset();
    storedOptions = null;
    selectError = null;
    upsertError = null;
    upsertCalls.length = 0;
    stub();
  });

  it("前後の空白を削除して追加し、選択肢に反映される", async () => {
    storedOptions = ["初診"];
    const result = await addAppointmentDescriptionOption("clinic-1", "  ホワイトニング相談  ");
    expect(result).toEqual({ ok: true, options: ["初診", "ホワイトニング相談"] });
    expect(upsertCalls).toEqual([{ clinic_id: "clinic-1", appointment_description_options: ["初診", "ホワイトニング相談"] }]);
  });

  it("1文字未満・20文字超はinvalid", async () => {
    expect(await addAppointmentDescriptionOption("clinic-1", "  ")).toEqual({ ok: false, reason: "invalid" });
    expect(await addAppointmentDescriptionOption("clinic-1", "あ".repeat(21))).toEqual({ ok: false, reason: "invalid" });
  });

  it("既存と同じ名前はduplicate", async () => {
    storedOptions = ["初診", "相談"];
    expect(await addAppointmentDescriptionOption("clinic-1", "相談")).toEqual({ ok: false, reason: "duplicate" });
  });

  it("未設定(null)の状態から追加する場合は、初期の選択肢に追加する", async () => {
    storedOptions = null;
    const result = await addAppointmentDescriptionOption("clinic-1", "ホワイトニング相談");
    expect(result).toEqual({ ok: true, options: [...DEFAULT_APPOINTMENT_DESCRIPTION_OPTIONS, "ホワイトニング相談"] });
  });

  it("migration未適用(42703)はunsupported", async () => {
    selectError = { code: "42703", message: "column does not exist" };
    expect(await addAppointmentDescriptionOption("clinic-1", "ホワイトニング相談")).toEqual({ ok: false, reason: "unsupported" });
  });
});
