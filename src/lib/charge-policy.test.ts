import { describe, it, expect } from "vitest";
import {
  resolveCancelTier,
  daysBeforeAppointment,
  computeChargeAmount,
  evaluateChargeEligibility,
  areTierPercentsValid,
  type CancelTier,
} from "./charge-policy";

const TIERS: CancelTier[] = [
  { daysBefore: 3, percent: 0 },
  { daysBefore: 1, percent: 30 },
  { daysBefore: 0, percent: 50 },
  { noShow: true, percent: 100 },
];

const APPT_AT = "2026-09-10T09:00:00.000Z"; // 予約日時
const CREATED_AT = "2026-08-20T09:00:00.000Z"; // 十分前に作成（grace_hoursに掛からない基準）

describe("daysBeforeAppointment", () => {
  it("予約日時より前なら正の日数", () => {
    expect(daysBeforeAppointment(APPT_AT, "2026-09-07T09:00:00.000Z")).toBeCloseTo(3, 5);
  });
  it("予約日時より後（無断判定時）なら負の日数", () => {
    expect(daysBeforeAppointment(APPT_AT, "2026-09-11T09:00:00.000Z")).toBeCloseTo(-1, 5);
  });
});

describe("resolveCancelTier: grace_hours優先", () => {
  it("grace_hours以内は無条件で無料（tiersが100%でも上書きしない）", () => {
    const r = resolveCancelTier({
      tiers: TIERS,
      appointmentAt: APPT_AT,
      createdAt: "2026-09-09T00:00:00.000Z",
      eventAt: "2026-09-09T10:00:00.000Z", // 作成から10時間後（<24h）、かつ当日キャンセル相当
      graceHours: 24,
      isNoShow: false,
    });
    expect(r.reason).toBe("grace_hours");
    expect(r.percent).toBe(0);
  });

  it("ちょうどgrace_hoursは無料（境界値）", () => {
    const r = resolveCancelTier({
      tiers: TIERS,
      appointmentAt: APPT_AT,
      createdAt: "2026-09-01T00:00:00.000Z",
      eventAt: "2026-09-02T00:00:00.000Z", // ちょうど24時間後
      graceHours: 24,
      isNoShow: false,
    });
    expect(r.reason).toBe("grace_hours");
  });
});

describe("resolveCancelTier: 通常キャンセルの段階判定（境界値）", () => {
  it("3日前ちょうど→0%", () => {
    const r = resolveCancelTier({
      tiers: TIERS, appointmentAt: APPT_AT, createdAt: CREATED_AT,
      eventAt: "2026-09-07T09:00:00.000Z", graceHours: 24, isNoShow: false,
    });
    expect(r.reason).toBe("tier");
    expect(r.percent).toBe(0);
    expect(r.matchedTier).toEqual({ daysBefore: 3, percent: 0 });
  });

  it("2日前（3日前は過ぎたが1日前の閾値は満たす）→30%", () => {
    const r = resolveCancelTier({
      tiers: TIERS, appointmentAt: APPT_AT, createdAt: CREATED_AT,
      eventAt: "2026-09-08T09:00:00.000Z", graceHours: 24, isNoShow: false,
    });
    expect(r.percent).toBe(30);
    expect(r.matchedTier).toEqual({ daysBefore: 1, percent: 30 });
  });

  it("ちょうど当日（0日前）→50%", () => {
    const r = resolveCancelTier({
      tiers: TIERS, appointmentAt: APPT_AT, createdAt: CREATED_AT,
      eventAt: "2026-09-10T03:00:00.000Z", graceHours: 1, isNoShow: false, // grace_hoursに掛からないよう1hに設定
    });
    expect(r.percent).toBe(50);
    expect(r.matchedTier).toEqual({ daysBefore: 0, percent: 50 });
  });

  it("該当する段階が無ければ請求しない(no_matching_tier)", () => {
    const r = resolveCancelTier({
      tiers: [{ daysBefore: 3, percent: 0 }], // 当日・前日用のtierが無い
      appointmentAt: APPT_AT, createdAt: CREATED_AT,
      eventAt: "2026-09-10T03:00:00.000Z", graceHours: 1, isNoShow: false,
    });
    expect(r.reason).toBe("no_matching_tier");
    expect(r.percent).toBe(0);
    expect(r.matchedTier).toBeNull();
  });
});

describe("resolveCancelTier: 無断不来院（境界値）", () => {
  it("no_show段階が設定済みなら100%", () => {
    const r = resolveCancelTier({
      tiers: TIERS, appointmentAt: APPT_AT, createdAt: CREATED_AT,
      eventAt: "2026-09-11T00:00:00.000Z", graceHours: 24, isNoShow: true,
    });
    expect(r.reason).toBe("tier");
    expect(r.percent).toBe(100);
  });

  it("no_show段階が未設定なら請求しない(no_show_tier_missing)", () => {
    const r = resolveCancelTier({
      tiers: [{ daysBefore: 3, percent: 0 }],
      appointmentAt: APPT_AT, createdAt: CREATED_AT,
      eventAt: "2026-09-11T00:00:00.000Z", graceHours: 24, isNoShow: true,
    });
    expect(r.reason).toBe("no_show_tier_missing");
    expect(r.percent).toBe(0);
  });

  it("無断でもgrace_hours以内なら無料が優先される", () => {
    const r = resolveCancelTier({
      tiers: TIERS, appointmentAt: APPT_AT, createdAt: "2026-09-10T08:00:00.000Z",
      eventAt: "2026-09-10T09:30:00.000Z", graceHours: 24, isNoShow: true,
    });
    expect(r.reason).toBe("grace_hours");
  });
});

describe("computeChargeAmount", () => {
  it("percent×base_amountを円で切り捨て", () => {
    expect(computeChargeAmount(10000, 30)).toBe(3000);
    expect(computeChargeAmount(3333, 30)).toBe(999); // 999.9 → 999
    expect(computeChargeAmount(10000, 0)).toBe(0);
    expect(computeChargeAmount(10000, 100)).toBe(10000);
  });
});

describe("evaluateChargeEligibility: 成立条件4項のAND", () => {
  const BASE = {
    cancelPolicyApplied: true,
    cancelPolicyAgreedAt: "2026-08-20T09:00:00.000Z",
    withinGraceHours: false,
    hasPaymentMethod: true,
    chargeExecutionEnabled: true,
  };

  it("全て満たせばeligible", () => {
    expect(evaluateChargeEligibility(BASE)).toEqual({ eligible: true, blockedBy: [] });
  });

  it("未同意ならnot_consented", () => {
    const r = evaluateChargeEligibility({ ...BASE, cancelPolicyApplied: false, cancelPolicyAgreedAt: null });
    expect(r.eligible).toBe(false);
    expect(r.blockedBy).toContain("not_consented");
  });

  it("grace_hours内ならwithin_grace_hours", () => {
    const r = evaluateChargeEligibility({ ...BASE, withinGraceHours: true });
    expect(r.blockedBy).toEqual(["within_grace_hours"]);
  });

  it("カード未登録ならno_payment_method", () => {
    const r = evaluateChargeEligibility({ ...BASE, hasPaymentMethod: false });
    expect(r.blockedBy).toEqual(["no_payment_method"]);
  });

  it("フラグOFFならflag_disabled", () => {
    const r = evaluateChargeEligibility({ ...BASE, chargeExecutionEnabled: false });
    expect(r.blockedBy).toEqual(["flag_disabled"]);
  });

  it("複数条件が同時に不成立なら全て列挙する", () => {
    const r = evaluateChargeEligibility({
      cancelPolicyApplied: false, cancelPolicyAgreedAt: null,
      withinGraceHours: true, hasPaymentMethod: false, chargeExecutionEnabled: false,
    });
    expect(r.blockedBy).toEqual(["not_consented", "within_grace_hours", "no_payment_method", "flag_disabled"]);
  });
});

describe("areTierPercentsValid", () => {
  it("0〜100なら有効", () => {
    expect(areTierPercentsValid([{ percent: 0 }, { percent: 100 }, { daysBefore: 1, percent: 50 }])).toBe(true);
  });
  it("100超は無効", () => {
    expect(areTierPercentsValid([{ percent: 101 }])).toBe(false);
  });
  it("負値は無効", () => {
    expect(areTierPercentsValid([{ percent: -1 }])).toBe(false);
  });
});
