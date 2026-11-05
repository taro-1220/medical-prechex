import { describe, it, expect } from "vitest";
import type { Appointment } from "./types";
import {
  isTodayJst,
  matchesRange,
  matchesStatus,
  filterAppointments,
  sortByRange,
  groupByDateJst,
  buildMonthWeeks,
  countsByDateAndStatus,
} from "./clinic-appointments-view";

function makeAppt(overrides: Partial<Appointment> & { appointmentAt: string }): Appointment {
  return {
    id: overrides.id ?? "a1",
    token: overrides.token ?? "tok1",
    clinicName: "テスト医院",
    patientName: "山田太郎",
    phone: "",
    email: "",
    communicationChannel: "manual",
    description: "",
    cancellationPolicy: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    treatmentCategory: "other",
    cancelPolicyApplied: false,
    baseAmount: null,
    cardRegistrationRequired: false,
    chargeStatus: "none",
    chargedAmount: null,
    status: "confirmed",
    ...overrides,
  };
}

describe("isTodayJst / matchesRange: JST境界", () => {
  it("UTC 14:59:59 は JST 23:59:59（前日の暦日）", () => {
    expect(isTodayJst("2026-03-04T14:59:59.000Z", "2026-03-04T14:59:59.000Z")).toBe(true);
    expect(matchesRange("2026-03-04T14:59:59.000Z", "2026-03-04T15:00:00.000Z", "past")).toBe(true);
  });

  it("UTC 15:00:00 は JST 翌日00:00:00（暦日が進む）", () => {
    // nowも同じUTC時刻なら両方「翌日JST」になり today
    expect(isTodayJst("2026-03-04T15:00:00.000Z", "2026-03-04T15:00:00.000Z")).toBe(true);
    // 予約がUTC14:59:59(JST3/4)、nowがUTC15:00:00(JST3/5)なら予約は過去
    expect(matchesRange("2026-03-04T14:59:59.000Z", "2026-03-04T15:00:00.000Z", "today")).toBe(false);
  });

  it("upcoming/past は JST暦日の前後で判定する", () => {
    const now = "2026-03-04T15:00:00.000Z"; // JST 2026-03-05 00:00
    expect(matchesRange("2026-03-05T15:00:00.000Z", now, "upcoming")).toBe(true); // JST 3/6
    expect(matchesRange("2026-03-03T23:00:00.000Z", now, "past")).toBe(true); // JST 3/4
    expect(matchesRange("2026-03-04T15:00:00.000Z", now, "today")).toBe(true); // JST 3/5 == 3/5
  });
});

describe("matchesStatus: /clinic の集計カードと同じ定義", () => {
  it("pending/confirmed/visited/canceled のマッピング", () => {
    expect(matchesStatus("confirmation_pending", "pending")).toBe(true);
    expect(matchesStatus("confirmed", "confirmed")).toBe(true);
    expect(matchesStatus("ticket_issued", "confirmed")).toBe(true);
    expect(matchesStatus("checked_in", "visited")).toBe(true);
    expect(matchesStatus("cancelled", "canceled")).toBe(true);
    expect(matchesStatus("expired", "canceled")).toBe(true);
    expect(matchesStatus("completed", "pending")).toBe(false);
    expect(matchesStatus("completed", "confirmed")).toBe(false);
    expect(matchesStatus("completed", "visited")).toBe(false);
    expect(matchesStatus("completed", "canceled")).toBe(false);
  });

  it("filterが無ければ常にtrue", () => {
    expect(matchesStatus("completed", null)).toBe(true);
    expect(matchesStatus("completed", undefined)).toBe(true);
  });
});

describe("sortByRange: 並び順", () => {
  const a = makeAppt({ id: "a", appointmentAt: "2026-03-01T00:00:00.000Z" });
  const b = makeAppt({ id: "b", appointmentAt: "2026-03-03T00:00:00.000Z" });
  const c = makeAppt({ id: "c", appointmentAt: "2026-03-02T00:00:00.000Z" });

  it("today/upcoming は時刻昇順", () => {
    expect(sortByRange([b, a, c], "today").map((x) => x.id)).toEqual(["a", "c", "b"]);
    expect(sortByRange([b, a, c], "upcoming").map((x) => x.id)).toEqual(["a", "c", "b"]);
  });

  it("past/all は時刻降順", () => {
    expect(sortByRange([b, a, c], "past").map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(sortByRange([b, a, c], "all").map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("空配列は空配列", () => {
    expect(sortByRange([], "today")).toEqual([]);
  });
});

describe("groupByDateJst: 日付ごとのグループ化", () => {
  it("入力順を保持したままJST暦日でグループ化する", () => {
    const items = [
      makeAppt({ id: "1", appointmentAt: "2026-03-01T01:00:00.000Z" }), // JST 3/1
      makeAppt({ id: "2", appointmentAt: "2026-03-01T05:00:00.000Z" }), // JST 3/1
      makeAppt({ id: "3", appointmentAt: "2026-03-02T01:00:00.000Z" }), // JST 3/2
    ];
    const groups = groupByDateJst(items);
    expect(groups.map((g) => g.dateKey)).toEqual(["2026-03-01", "2026-03-02"]);
    expect(groups[0].items.map((x) => x.id)).toEqual(["1", "2"]);
    expect(groups[1].items.map((x) => x.id)).toEqual(["3"]);
  });

  it("空配列は空配列", () => {
    expect(groupByDateJst([])).toEqual([]);
  });
});

describe("filterAppointments: 期間と状態のAND条件", () => {
  it("rangeとstatusを両方満たすものだけ残る", () => {
    const items = [
      makeAppt({ id: "1", appointmentAt: "2026-03-05T00:00:00.000Z", status: "confirmed" }),
      makeAppt({ id: "2", appointmentAt: "2026-03-05T00:00:00.000Z", status: "checked_in" }),
      makeAppt({ id: "3", appointmentAt: "2026-03-06T00:00:00.000Z", status: "confirmed" }),
    ];
    const nowIso = "2026-03-05T00:00:00.000Z";
    const res = filterAppointments(items, { nowIso, range: "today", status: "confirmed" });
    expect(res.map((x) => x.id)).toEqual(["1"]);
  });
});

describe("buildMonthWeeks: 月カレンダー", () => {
  it("月初の曜日に応じて前月の日で先頭を埋める（2026-03は日曜始まり）", () => {
    const weeks = buildMonthWeeks("2026-03", "2026-03-04T00:00:00.000Z");
    expect(weeks[0][0].dateKey).toBe("2026-03-01");
    expect(weeks[0][0].weekday).toBe(0);
    // 2026-03-01は日曜日なので前月の埋めは無い
    expect(weeks[0].every((d) => d.inMonth)).toBe(true);
  });

  it("月末の曜日に応じて翌月の日で末尾を埋める", () => {
    const weeks = buildMonthWeeks("2026-02", "2026-02-01T00:00:00.000Z");
    const lastWeek = weeks[weeks.length - 1];
    const trailing = lastWeek.filter((d) => !d.inMonth);
    expect(trailing.every((d) => d.dateKey.startsWith("2026-03"))).toBe(true);
    expect(lastWeek.length).toBe(7);
  });

  it("うるう年2月は29日まで（2028年）", () => {
    const weeks = buildMonthWeeks("2028-02", "2028-02-01T00:00:00.000Z");
    const allDays = weeks.flat().filter((d) => d.inMonth);
    expect(allDays.length).toBe(29);
    expect(allDays[allDays.length - 1].dateKey).toBe("2028-02-29");
  });

  it("平年2月は28日まで", () => {
    const weeks = buildMonthWeeks("2026-02", "2026-02-01T00:00:00.000Z");
    const allDays = weeks.flat().filter((d) => d.inMonth);
    expect(allDays.length).toBe(28);
  });

  it("今日のセルに isToday が立つ", () => {
    const weeks = buildMonthWeeks("2026-03", "2026-03-04T15:00:00.000Z"); // JST 3/5
    const today = weeks.flat().find((d) => d.isToday);
    expect(today?.dateKey).toBe("2026-03-05");
  });

  it("各週は7日ちょうど", () => {
    const weeks = buildMonthWeeks("2026-03", "2026-03-01T00:00:00.000Z");
    for (const w of weeks) expect(w.length).toBe(7);
  });
});

describe("countsByDateAndStatus: 日ごとの状態別件数", () => {
  it("同じ日・同じ状態が積算される", () => {
    const items = [
      makeAppt({ id: "1", appointmentAt: "2026-03-05T01:00:00.000Z", status: "confirmed" }),
      makeAppt({ id: "2", appointmentAt: "2026-03-05T02:00:00.000Z", status: "confirmed" }),
      makeAppt({ id: "3", appointmentAt: "2026-03-05T03:00:00.000Z", status: "checked_in" }),
      makeAppt({ id: "4", appointmentAt: "2026-03-05T04:00:00.000Z", status: "completed" }),
    ];
    const counts = countsByDateAndStatus(items);
    expect(counts["2026-03-05"]).toEqual({ pending: 0, confirmed: 2, visited: 1, canceled: 0 });
  });

  it("空配列は空オブジェクト", () => {
    expect(countsByDateAndStatus([])).toEqual({});
  });
});
