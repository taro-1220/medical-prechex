import { describe, it, expect } from "vitest";
import {
  resolveCancelTier,
  daysBeforeAppointment,
  computeChargeAmount,
  evaluateChargeEligibility,
  areTierPercentsValid,
  computeFreeCancellationDeadline,
  extractStatedDeadlineDaysBefore,
  checkPolicyTierConsistency,
  formatYen,
  formatTierAmount,
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

describe("computeFreeCancellationDeadline: 日境界化（Asia/Tokyo固定、23:59:59 JST）", () => {
  // 2026-09-10T09:00:00.000Z（UTC）= 2026-09-10 18:00 JST
  const APPT = "2026-09-10T09:00:00.000Z";

  it("percent=0の段階（最小daysBefore）から「N日前 23:59:59 JST」を算出する", () => {
    // 3日前=9/7。23:59:59 JST(=UTC+9) → UTC 14:59:59
    expect(computeFreeCancellationDeadline(APPT, [
      { daysBefore: 3, percent: 0 }, { daysBefore: 1, percent: 30 },
    ])).toBe("2026-09-07T14:59:59.000Z");
  });

  it("percent=0の段階が複数あっても最小daysBefore側が境界になる", () => {
    expect(computeFreeCancellationDeadline(APPT, [
      { daysBefore: 5, percent: 0 }, { daysBefore: 3, percent: 0 }, { daysBefore: 1, percent: 30 },
    ])).toBe("2026-09-07T14:59:59.000Z");
  });

  it("percent=0の段階が無ければnull", () => {
    expect(computeFreeCancellationDeadline(APPT, [{ daysBefore: 1, percent: 30 }])).toBeNull();
  });

  it("tiersがnull/未設定ならnull", () => {
    expect(computeFreeCancellationDeadline(APPT, null)).toBeNull();
    expect(computeFreeCancellationDeadline(APPT, undefined)).toBeNull();
  });

  it("minDaysBefore=0（当日が0%）は日境界にせず、appointmentAtそのものを返す（ガード）", () => {
    expect(computeFreeCancellationDeadline(APPT, [{ daysBefore: 0, percent: 0 }])).toBe(
      new Date(APPT).toISOString(),
    );
  });

  it("予約時刻が00:00台でも正しくN日前23:59:59になる", () => {
    // 2026-09-10T15:10:00Z = 2026-09-11 00:10 JST（日付はJSTで9/11）
    const apptEarlyMorning = "2026-09-10T15:10:00.000Z";
    // 3日前=9/8。23:59:59 JST → UTC 14:59:59
    expect(computeFreeCancellationDeadline(apptEarlyMorning, [{ daysBefore: 3, percent: 0 }])).toBe(
      "2026-09-08T14:59:59.000Z",
    );
  });

  it("予約時刻が23:00台でも正しくN日前23:59:59になる（日付が跨がらない側）", () => {
    // 2026-09-10T14:30:00Z = 2026-09-10 23:30 JST
    const apptLateNight = "2026-09-10T14:30:00.000Z";
    expect(computeFreeCancellationDeadline(apptLateNight, [{ daysBefore: 3, percent: 0 }])).toBe(
      "2026-09-07T14:59:59.000Z",
    );
  });

  it("JST/UTC日跨ぎ: 予約がJST 08:00（=UTC前日23:00）でもJSTの暦日を基準にする", () => {
    // 2026-09-09T23:00:00Z = 2026-09-10 08:00 JST（UTC暦日は9/9だがJST暦日は9/10）
    const apptCrossesUtcDay = "2026-09-09T23:00:00.000Z";
    // JST基準で3日前=9/7。UTC暦日基準（誤り）なら9/6になってしまうため、そうならないことを確認
    expect(computeFreeCancellationDeadline(apptCrossesUtcDay, [{ daysBefore: 3, percent: 0 }])).toBe(
      "2026-09-07T14:59:59.000Z",
    );
  });

  it("月またぎでも正しく計算できる", () => {
    // 2026-09-02T01:00:00Z = 2026-09-02 10:00 JST
    const apptEarlySeptember = "2026-09-02T01:00:00.000Z";
    // 3日前=8/30。23:59:59 JST → UTC 14:59:59
    expect(computeFreeCancellationDeadline(apptEarlySeptember, [{ daysBefore: 3, percent: 0 }])).toBe(
      "2026-08-30T14:59:59.000Z",
    );
  });

  it("締切の23:59:59とその1秒後（翌日00:00:00）は異なる日時として区別される", () => {
    const deadline = computeFreeCancellationDeadline(APPT, [{ daysBefore: 3, percent: 0 }])!;
    expect(deadline).toBe("2026-09-07T14:59:59.000Z");
    const oneSecondLater = new Date(new Date(deadline).getTime() + 1000).toISOString();
    expect(oneSecondLater).toBe("2026-09-07T15:00:00.000Z"); // JSTでは9/8 00:00:00
  });
});

describe("extractStatedDeadlineDaysBefore", () => {
  it("「n日前」を抽出する", () => {
    expect(extractStatedDeadlineDaysBefore("予約日3日前までのキャンセルは無料です。")).toBe(3);
  });
  it("「前日」は1として抽出する", () => {
    expect(extractStatedDeadlineDaysBefore("前日までにご連絡ください。")).toBe(1);
  });
  it("「当日」は0として抽出する", () => {
    expect(extractStatedDeadlineDaysBefore("当日のキャンセルは治療費の50%を頂戴します。")).toBe(0);
  });
  it("該当する表現が無ければnull", () => {
    expect(extractStatedDeadlineDaysBefore("お早めにご連絡ください。")).toBeNull();
  });
});

describe("checkPolicyTierConsistency", () => {
  const TIERS_3DAY_FREE: CancelTier[] = [{ daysBefore: 3, percent: 0 }, { daysBefore: 1, percent: 50 }];

  it("本文とtiersの日数が一致すれば矛盾なし", () => {
    const r = checkPolicyTierConsistency("予約日3日前までのキャンセルは無料です。", TIERS_3DAY_FREE);
    expect(r.mismatched).toBe(false);
    expect(r.statedDaysBefore).toBe(3);
    expect(r.tierDaysBefore).toBe(3);
  });

  it("本文とtiersの日数が異なれば矛盾あり", () => {
    const r = checkPolicyTierConsistency("前日までのキャンセルは無料です。", TIERS_3DAY_FREE);
    expect(r.mismatched).toBe(true);
    expect(r.statedDaysBefore).toBe(1);
    expect(r.tierDaysBefore).toBe(3);
  });

  it("本文から抽出できなければ矛盾ありとしない（誤検出回避）", () => {
    const r = checkPolicyTierConsistency("お早めにご連絡ください。", TIERS_3DAY_FREE);
    expect(r.mismatched).toBe(false);
    expect(r.statedDaysBefore).toBeNull();
  });

  it("tiersに0%段階が無ければ矛盾ありとしない", () => {
    const r = checkPolicyTierConsistency("3日前までのキャンセルは無料です。", [{ daysBefore: 1, percent: 50 }]);
    expect(r.mismatched).toBe(false);
    expect(r.tierDaysBefore).toBeNull();
  });
});

describe("formatYen", () => {
  it("3桁区切りで円表示する", () => {
    expect(formatYen(5000)).toBe("5,000円");
    expect(formatYen(1234567)).toBe("1,234,567円");
    expect(formatYen(0)).toBe("0円");
  });
});

describe("formatTierAmount", () => {
  it("基準額があれば円建て＋%表示にする", () => {
    expect(formatTierAmount(50, 10000)).toBe("5,000円（治療費の50%）");
  });
  it("基準額があってもpercent=0は「無料」にする", () => {
    expect(formatTierAmount(0, 10000)).toBe("無料");
  });
  it("基準額が無ければ%単独表示にフォールバックする", () => {
    expect(formatTierAmount(50, null)).toBe("50%");
    expect(formatTierAmount(50, undefined)).toBe("50%");
  });
});
