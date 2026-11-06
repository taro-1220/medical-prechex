import { describe, it, expect } from "vitest";
import type { Appointment } from "./types";
import { selectReminderTargets, tomorrowJstDateKey } from "./reminder-targets";

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

describe("tomorrowJstDateKey: JST境界", () => {
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
});

describe("selectReminderTargets", () => {
  const nowIso = "2026-03-04T15:00:00.000Z"; // JST 2026-03-05、翌日=2026-03-06
  const tomorrow = "2026-03-06T01:00:00.000Z"; // JST 2026-03-06

  it("対象状態(confirmation_pending/confirmed/ticket_issued)のみ残る", () => {
    const items = [
      makeAppt({ id: "1", appointmentAt: tomorrow, status: "confirmation_pending" }),
      makeAppt({ id: "2", appointmentAt: tomorrow, status: "confirmed" }),
      makeAppt({ id: "3", appointmentAt: tomorrow, status: "ticket_issued" }),
      makeAppt({ id: "4", appointmentAt: tomorrow, status: "checked_in" }),
      makeAppt({ id: "5", appointmentAt: tomorrow, status: "completed" }),
      makeAppt({ id: "6", appointmentAt: tomorrow, status: "cancelled" }),
      makeAppt({ id: "7", appointmentAt: tomorrow, status: "expired" }),
    ];
    const res = selectReminderTargets(items, nowIso, new Set());
    expect(res.map((a) => a.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("翌日以外(今日・翌々日)は対象外", () => {
    const items = [
      makeAppt({ id: "today", appointmentAt: "2026-03-05T01:00:00.000Z" }),
      makeAppt({ id: "tomorrow", appointmentAt: tomorrow }),
      makeAppt({ id: "dayafter", appointmentAt: "2026-03-07T01:00:00.000Z" }),
    ];
    const res = selectReminderTargets(items, nowIso, new Set());
    expect(res.map((a) => a.id)).toEqual(["tomorrow"]);
  });

  it("メールアドレスが無い予約は対象外", () => {
    const items = [makeAppt({ id: "1", appointmentAt: tomorrow, email: "" })];
    expect(selectReminderTargets(items, nowIso, new Set())).toEqual([]);
  });

  it("送信記録がある予約は対象外", () => {
    const items = [makeAppt({ id: "1", appointmentAt: tomorrow })];
    expect(selectReminderTargets(items, nowIso, new Set(["1"]))).toEqual([]);
  });

  it("空配列は空配列", () => {
    expect(selectReminderTargets([], nowIso, new Set())).toEqual([]);
  });
});
