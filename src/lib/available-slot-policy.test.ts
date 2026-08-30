import { describe, it, expect } from "vitest";
import { isEligibleForSlotReopen, isWithinDailyNotifyLimit, DAILY_NOTIFY_LIMIT } from "./available-slot-policy";

describe("isEligibleForSlotReopen", () => {
  const now = new Date("2026-08-29T00:00:00Z");

  it("未来の予約かつ直前statusがcancelled以外なら再募集可", () => {
    expect(isEligibleForSlotReopen({ previousStatus: "confirmed", appointmentAt: "2026-08-29T06:00:00Z", now })).toBe(true);
  });

  it("直前statusが既にcancelledなら再募集しない（二重発火防止）", () => {
    expect(isEligibleForSlotReopen({ previousStatus: "cancelled", appointmentAt: "2026-08-29T06:00:00Z", now })).toBe(false);
  });

  it("過去の予約なら再募集しない", () => {
    expect(isEligibleForSlotReopen({ previousStatus: "confirmed", appointmentAt: "2026-08-28T00:00:00Z", now })).toBe(false);
  });

  it("ticket_issuedからのキャンセルでも未来なら再募集可", () => {
    expect(isEligibleForSlotReopen({ previousStatus: "ticket_issued", appointmentAt: "2026-08-30T00:00:00Z", now })).toBe(true);
  });
});

describe("isWithinDailyNotifyLimit", () => {
  it("初期仕様は1日2回まで", () => {
    expect(DAILY_NOTIFY_LIMIT).toBe(2);
  });

  it("0件・1件なら送信可", () => {
    expect(isWithinDailyNotifyLimit(0)).toBe(true);
    expect(isWithinDailyNotifyLimit(1)).toBe(true);
  });

  it("上限到達・超過なら送信不可", () => {
    expect(isWithinDailyNotifyLimit(2)).toBe(false);
    expect(isWithinDailyNotifyLimit(3)).toBe(false);
  });

  it("limitを明示指定できる", () => {
    expect(isWithinDailyNotifyLimit(4, 5)).toBe(true);
    expect(isWithinDailyNotifyLimit(5, 5)).toBe(false);
  });
});
