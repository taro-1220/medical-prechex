import { describe, it, expect } from "vitest";
import { isValidAppointmentDescriptionLabel, DEFAULT_APPOINTMENT_DESCRIPTION_OPTIONS } from "./appointment-description-options";

describe("isValidAppointmentDescriptionLabel", () => {
  it("1〜20文字はtrue", () => {
    expect(isValidAppointmentDescriptionLabel("相")).toBe(true);
    expect(isValidAppointmentDescriptionLabel("あ".repeat(20))).toBe(true);
  });

  it("0文字・21文字以上はfalse", () => {
    expect(isValidAppointmentDescriptionLabel("")).toBe(false);
    expect(isValidAppointmentDescriptionLabel("あ".repeat(21))).toBe(false);
  });
});

describe("DEFAULT_APPOINTMENT_DESCRIPTION_OPTIONS", () => {
  it("初期の選択肢は4件", () => {
    expect(DEFAULT_APPOINTMENT_DESCRIPTION_OPTIONS).toEqual(["初診", "再診（治療の続き）", "定期検診・クリーニング", "相談"]);
  });
});
