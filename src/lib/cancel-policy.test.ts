import { describe, it, expect } from "vitest";
import {
  scopeAppliesToCategory,
  resolveCancelPolicyApplication,
  isWithinGraceHours,
  findRiskyPolicyWording,
  isBasisNoteValid,
  isInsuranceAcknowledgmentSatisfied,
  isGeneralPolicyStepComplete,
} from "./cancel-policy";

describe("scopeAppliesToCategory", () => {
  it("other はどの scope でも対象外", () => {
    expect(scopeAppliesToCategory("private", "other")).toBe(false);
    expect(scopeAppliesToCategory("insurance", "other")).toBe(false);
    expect(scopeAppliesToCategory("both", "other")).toBe(false);
  });
  it("scope='private' は private のみ対象", () => {
    expect(scopeAppliesToCategory("private", "private")).toBe(true);
    expect(scopeAppliesToCategory("private", "insurance")).toBe(false);
  });
  it("scope='insurance' は insurance のみ対象", () => {
    expect(scopeAppliesToCategory("insurance", "insurance")).toBe(true);
    expect(scopeAppliesToCategory("insurance", "private")).toBe(false);
  });
  it("scope='both' は private/insurance いずれも対象", () => {
    expect(scopeAppliesToCategory("both", "private")).toBe(true);
    expect(scopeAppliesToCategory("both", "insurance")).toBe(true);
  });
});

describe("resolveCancelPolicyApplication", () => {
  it("cancel_policy_enabled=false なら override に関わらず適用なし", () => {
    expect(resolveCancelPolicyApplication({ enabled: false, scope: "both" }, "private", null)).toBe(false);
    expect(resolveCancelPolicyApplication({ enabled: false, scope: "both" }, "private", true)).toBe(false);
  });
  it("有効かつscope一致なら適用", () => {
    expect(resolveCancelPolicyApplication({ enabled: true, scope: "private" }, "private", null)).toBe(true);
    expect(resolveCancelPolicyApplication({ enabled: true, scope: "insurance" }, "insurance", null)).toBe(true);
    expect(resolveCancelPolicyApplication({ enabled: true, scope: "both" }, "insurance", null)).toBe(true);
  });
  it("有効だがscope不一致なら適用なし", () => {
    expect(resolveCancelPolicyApplication({ enabled: true, scope: "private" }, "insurance", null)).toBe(false);
  });
  it("treatment='other' は既定で適用なし", () => {
    expect(resolveCancelPolicyApplication({ enabled: true, scope: "both" }, "other", null)).toBe(false);
  });
  it("manualOverride=true でスタッフが手動ON（otherでも適用できる）", () => {
    expect(resolveCancelPolicyApplication({ enabled: true, scope: "both" }, "other", true)).toBe(true);
  });
  it("manualOverride=false でスタッフが手動OFF（scope一致でも適用しない）", () => {
    expect(resolveCancelPolicyApplication({ enabled: true, scope: "private" }, "private", false)).toBe(false);
  });
  it("scope未設定（enabledなのにscopeがnull）なら適用なし", () => {
    expect(resolveCancelPolicyApplication({ enabled: true, scope: null }, "private", null)).toBe(false);
  });
});

describe("isWithinGraceHours", () => {
  it("grace_hours以内なら無料対象", () => {
    expect(isWithinGraceHours("2026-08-01T00:00:00.000Z", "2026-08-01T10:00:00.000Z", 24)).toBe(true);
  });
  it("ちょうどgrace_hoursは無料対象（境界値）", () => {
    expect(isWithinGraceHours("2026-08-01T00:00:00.000Z", "2026-08-02T00:00:00.000Z", 24)).toBe(true);
  });
  it("grace_hoursを過ぎたら無料対象外", () => {
    expect(isWithinGraceHours("2026-08-01T00:00:00.000Z", "2026-08-02T00:00:01.000Z", 24)).toBe(false);
  });
});

describe("findRiskyPolicyWording", () => {
  it("「全額」「100%」「違約金」「罰金」を検出する", () => {
    expect(findRiskyPolicyWording("キャンセル料は全額いただきます。")).toEqual(["全額"]);
    expect(findRiskyPolicyWording("当日キャンセルは100%請求します。")).toEqual(["100%"]);
    expect(findRiskyPolicyWording("違約金として頂戴します。")).toEqual(["違約金"]);
    expect(findRiskyPolicyWording("罰金を科します。")).toEqual(["罰金"]);
  });
  it("複数該当時はすべて返す", () => {
    expect(findRiskyPolicyWording("全額かつ違約金として請求")).toEqual(["全額", "違約金"]);
  });
  it("該当なしは空配列", () => {
    expect(findRiskyPolicyWording("予約日24時間前以降のキャンセルはキャンセル料が発生します。")).toEqual([]);
  });
});

describe("isBasisNoteValid", () => {
  it("空文字・空白のみは不可", () => {
    expect(isBasisNoteValid("")).toBe(false);
    expect(isBasisNoteValid("   ")).toBe(false);
  });
  it("本文があれば可", () => {
    expect(isBasisNoteValid("1枠60分の準備原価と埋め戻し困難性")).toBe(true);
  });
});

describe("isInsuranceAcknowledgmentSatisfied", () => {
  it("scope='private' は同意不要", () => {
    expect(isInsuranceAcknowledgmentSatisfied("private", false)).toBe(true);
  });
  it("scope='insurance' は同意必須", () => {
    expect(isInsuranceAcknowledgmentSatisfied("insurance", false)).toBe(false);
    expect(isInsuranceAcknowledgmentSatisfied("insurance", true)).toBe(true);
  });
  it("scope='both' は同意必須", () => {
    expect(isInsuranceAcknowledgmentSatisfied("both", false)).toBe(false);
    expect(isInsuranceAcknowledgmentSatisfied("both", true)).toBe(true);
  });
});

describe("isGeneralPolicyStepComplete", () => {
  it("本文があれば完了", () => {
    expect(isGeneralPolicyStepComplete("予約日24時間前以降はキャンセル料が発生します。", true)).toBe(true);
    expect(isGeneralPolicyStepComplete("予約日24時間前以降はキャンセル料が発生します。", false)).toBe(true);
  });
  it("本文が空でも cancel_policy_enabled=false なら完了", () => {
    expect(isGeneralPolicyStepComplete("", false)).toBe(true);
    expect(isGeneralPolicyStepComplete("   ", false)).toBe(true);
  });
  it("本文が空で cancel_policy_enabled=true なら未完了", () => {
    expect(isGeneralPolicyStepComplete("", true)).toBe(false);
    expect(isGeneralPolicyStepComplete("   ", true)).toBe(false);
  });
});
