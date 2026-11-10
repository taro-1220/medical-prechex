import { describe, it, expect } from "vitest";
import type { Appointment } from "./types";
import { selectReminderTargets, tomorrowJstDateKey, threeDaysAheadJstDateKey, reminderEmailOf } from "./reminder-targets";

function makeAppt(overrides: Partial<Appointment> & { appointmentAt: string }): Appointment {
  return {
    id: overrides.id ?? "a1",
    token: overrides.token ?? "tok1",
    clinicName: "テスト医院",
    patientName: "山田太郎",
    phone: "",
    email: "patient@example.com",
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
    clinicId: "clinic-1",
    ...overrides,
  };
}

const noneSent = { threeDaysBefore: new Set<string>(), dayBefore: new Set<string>() };

describe("tomorrowJstDateKey / threeDaysAheadJstDateKey: JST境界", () => {
  it("UTC 14:59:59(JST同日23:59:59)の翌日はJST暦日として1日後", () => {
    expect(tomorrowJstDateKey("2026-03-04T14:59:59.000Z")).toBe("2026-03-05");
  });

  it("UTC 15:00:00(JST翌日00:00:00)の翌日はさらに1日後", () => {
    expect(tomorrowJstDateKey("2026-03-04T15:00:00.000Z")).toBe("2026-03-06");
  });

  it("月末をまたぐ", () => {
    expect(tomorrowJstDateKey("2026-01-30T15:00:00.000Z")).toBe("2026-02-01");
  });

  it("うるう年2月末をまたぐ", () => {
    expect(tomorrowJstDateKey("2028-02-28T15:00:00.000Z")).toBe("2028-03-01");
  });

  it("3日後はJST暦日境界(UTC 15:00)の前後で切り替わる", () => {
    expect(threeDaysAheadJstDateKey("2026-03-04T14:59:59.000Z")).toBe("2026-03-07");
    expect(threeDaysAheadJstDateKey("2026-03-04T15:00:00.000Z")).toBe("2026-03-08");
  });
});

describe("reminderEmailOf: 患者自身の登録メールを優先する", () => {
  it("患者登録メールがあればそれを使う", () => {
    const a = makeAppt({ appointmentAt: "2026-03-05T00:00:00.000Z", email: "staff@example.com", patientRegisteredEmail: "patient@example.com" });
    expect(reminderEmailOf(a)).toBe("patient@example.com");
  });
  it("無ければ予約作成時のメールを使う", () => {
    const a = makeAppt({ appointmentAt: "2026-03-05T00:00:00.000Z", email: "staff@example.com" });
    expect(reminderEmailOf(a)).toBe("staff@example.com");
  });
});

describe("selectReminderTargets", () => {
  const nowIso = "2026-03-04T15:00:00.000Z"; // JST 2026-03-05、翌日=2026-03-06、3日後=2026-03-08
  const tomorrow = "2026-03-06T01:00:00.000Z"; // JST 2026-03-06
  const threeDaysAhead = "2026-03-08T01:00:00.000Z"; // JST 2026-03-08

  it("対象状態(confirmation_pending/confirmed/ticket_issued)のみ残る（前日）", () => {
    const items = [
      makeAppt({ id: "1", appointmentAt: tomorrow, status: "confirmation_pending" }),
      makeAppt({ id: "2", appointmentAt: tomorrow, status: "confirmed" }),
      makeAppt({ id: "3", appointmentAt: tomorrow, status: "ticket_issued" }),
      makeAppt({ id: "4", appointmentAt: tomorrow, status: "checked_in" }),
      makeAppt({ id: "5", appointmentAt: tomorrow, status: "completed" }),
      makeAppt({ id: "6", appointmentAt: tomorrow, status: "cancelled" }),
      makeAppt({ id: "7", appointmentAt: tomorrow, status: "expired" }),
    ];
    const res = selectReminderTargets(items, nowIso, noneSent);
    expect(res.dayBefore.map((a) => a.id).sort()).toEqual(["1", "2", "3"]);
    expect(res.threeDaysBefore).toEqual([]);
  });

  it("キャンセル済みは3日前・前日どちらも対象外", () => {
    const items = [
      makeAppt({ id: "1", appointmentAt: tomorrow, status: "cancelled" }),
      makeAppt({ id: "2", appointmentAt: threeDaysAhead, status: "cancelled" }),
    ];
    const res = selectReminderTargets(items, nowIso, noneSent);
    expect(res.dayBefore).toEqual([]);
    expect(res.threeDaysBefore).toEqual([]);
  });

  it("翌日・3日後以外(今日・翌々日)は対象外", () => {
    const items = [
      makeAppt({ id: "today", appointmentAt: "2026-03-05T01:00:00.000Z" }),
      makeAppt({ id: "tomorrow", appointmentAt: tomorrow }),
      makeAppt({ id: "threeDaysAhead", appointmentAt: threeDaysAhead }),
      makeAppt({ id: "dayafter", appointmentAt: "2026-03-07T01:00:00.000Z" }),
    ];
    const res = selectReminderTargets(items, nowIso, noneSent);
    expect(res.dayBefore.map((a) => a.id)).toEqual(["tomorrow"]);
    expect(res.threeDaysBefore.map((a) => a.id)).toEqual(["threeDaysAhead"]);
  });

  it("メールアドレスが無い予約は対象外", () => {
    const items = [makeAppt({ id: "1", appointmentAt: tomorrow, email: "" })];
    expect(selectReminderTargets(items, nowIso, noneSent).dayBefore).toEqual([]);
  });

  it("予約作成時のメールが無くても、患者が自ら登録したメールがあれば対象", () => {
    const items = [makeAppt({ id: "1", appointmentAt: tomorrow, email: "", patientRegisteredEmail: "patient@example.com" })];
    expect(selectReminderTargets(items, nowIso, noneSent).dayBefore.map((a) => a.id)).toEqual(["1"]);
  });

  it("送信記録がある予約は、その種別のみ対象外になる", () => {
    const items = [makeAppt({ id: "1", appointmentAt: threeDaysAhead, createdAt: "2026-01-01T00:00:00.000Z" })];
    const res = selectReminderTargets(items, nowIso, { threeDaysBefore: new Set(["1"]), dayBefore: new Set() });
    expect(res.threeDaysBefore).toEqual([]);
  });

  it("予約日まで3日未満で登録された予約は、3日前リマインドの対象外（前日は対象）", () => {
    const items = [
      // 3日後の予約を、その前日(2026-03-07)に作成 = リードタイム1日
      makeAppt({ id: "1", appointmentAt: threeDaysAhead, createdAt: "2026-03-07T00:00:00.000Z" }),
    ];
    const res = selectReminderTargets(items, nowIso, noneSent);
    expect(res.threeDaysBefore).toEqual([]);
  });

  it("予約日まで3日以上前に登録された予約は、3日前リマインドの対象", () => {
    const items = [makeAppt({ id: "1", appointmentAt: threeDaysAhead, createdAt: "2026-03-01T00:00:00.000Z" })];
    const res = selectReminderTargets(items, nowIso, noneSent);
    expect(res.threeDaysBefore.map((a) => a.id)).toEqual(["1"]);
  });

  it("空配列は空配列", () => {
    const res = selectReminderTargets([], nowIso, noneSent);
    expect(res).toEqual({ threeDaysBefore: [], dayBefore: [] });
  });
});
