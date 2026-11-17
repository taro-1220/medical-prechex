import { describe, it, expect } from "vitest";
import { missingPatientFacingSettings, missingPatientFacingSettingsMessage } from "./clinic-readiness";

describe("missingPatientFacingSettings", () => {
  it("全項目ありなら空配列", () => {
    expect(
      missingPatientFacingSettings({ clinicDisplayName: "テスト医院", phone: "03-0000-0000", cancellationPolicy: "前日までキャンセル無料" }),
    ).toEqual([]);
  });

  it("電話番号が無い場合は「電話番号」のみ", () => {
    expect(
      missingPatientFacingSettings({ clinicDisplayName: "テスト医院", phone: "", cancellationPolicy: "前日までキャンセル無料" }),
    ).toEqual(["電話番号"]);
  });

  it("キャンセルポリシーが空白のみの場合も未設定として扱う", () => {
    expect(
      missingPatientFacingSettings({ clinicDisplayName: "テスト医院", phone: "03-0000-0000", cancellationPolicy: "   " }),
    ).toEqual(["キャンセルポリシー"]);
  });

  it("複数欠けている場合は全て列挙する", () => {
    expect(missingPatientFacingSettings({ clinicDisplayName: "", phone: "", cancellationPolicy: "" })).toEqual([
      "クリニック名", "電話番号", "キャンセルポリシー",
    ]);
  });

  it("profileがnull/undefinedなら全項目未設定", () => {
    expect(missingPatientFacingSettings(null)).toEqual(["クリニック名", "電話番号", "キャンセルポリシー"]);
    expect(missingPatientFacingSettings(undefined)).toEqual(["クリニック名", "電話番号", "キャンセルポリシー"]);
  });
});

describe("missingPatientFacingSettingsMessage", () => {
  it("未設定項目を列挙した案内文を返す", () => {
    expect(missingPatientFacingSettingsMessage(["電話番号", "キャンセルポリシー"])).toBe(
      "予約を作成する前に、医院設定で次の項目を設定してください：電話番号、キャンセルポリシー",
    );
  });
});
