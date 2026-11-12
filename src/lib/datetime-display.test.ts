import { describe, it, expect } from "vitest";
import { formatJstDateTime, jstLocalInputToIso, hasExplicitTimezoneOffset } from "./datetime-display";

describe("jstLocalInputToIso", () => {
  it("datetime-localの値（タイムゾーン無し）を日本時間として明示したISOに変換する", () => {
    expect(jstLocalInputToIso("2026-11-15T13:29")).toBe("2026-11-15T13:29:00+09:00");
  });

  it("変換後、UTCに直すと9時間前になる（13:29 JST → 04:29Z）", () => {
    const iso = jstLocalInputToIso("2026-11-15T13:29");
    expect(new Date(iso).toISOString()).toBe("2026-11-15T04:29:00.000Z");
  });

  it("日付をまたぐ時刻（23:30 JST）も正しくUTCに変換される", () => {
    const iso = jstLocalInputToIso("2026-11-15T23:30");
    expect(new Date(iso).toISOString()).toBe("2026-11-15T14:30:00.000Z");
  });

  it("日付をまたぐ時刻（00:30 JST）も正しくUTCに変換される（前日のUTC日付になる）", () => {
    const iso = jstLocalInputToIso("2026-11-15T00:30");
    expect(new Date(iso).toISOString()).toBe("2026-11-14T15:30:00.000Z");
  });
});

describe("hasExplicitTimezoneOffset", () => {
  it("オフセット無しはfalse", () => {
    expect(hasExplicitTimezoneOffset("2026-11-15T13:29:00")).toBe(false);
    expect(hasExplicitTimezoneOffset("2026-11-15T13:29")).toBe(false);
  });

  it("Zはtrue", () => {
    expect(hasExplicitTimezoneOffset("2026-11-15T13:29:00Z")).toBe(true);
  });

  it("+09:00などのオフセットはtrue", () => {
    expect(hasExplicitTimezoneOffset("2026-11-15T13:29:00+09:00")).toBe(true);
    expect(hasExplicitTimezoneOffset("2026-11-15T13:29:00-05:00")).toBe(true);
  });
});

describe("formatJstDateTime", () => {
  it("UTCのISO文字列を、常に日本時間として表示する（ブラウザのタイムゾーンに依存しない）", () => {
    // 2026-11-15T04:29:00Z = JST 13:29
    const text = formatJstDateTime("2026-11-15T04:29:00.000Z", { hour: "2-digit", minute: "2-digit" });
    expect(text).toContain("13:29");
  });
});
