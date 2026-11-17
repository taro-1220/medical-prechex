import { describe, it, expect } from "vitest";
import { resolvePatientFacingClinicName, resolvePatientFacingClinicPhone } from "./patient-facing-clinic";

describe("resolvePatientFacingClinicName", () => {
  it("clinic_profile.clinic_display_name が設定されていればそれを使う", () => {
    expect(resolvePatientFacingClinicName({ clinicDisplayName: "テスト医院" }, { name: "別名" })).toBe("テスト医院");
  });

  it("clinic_profile.clinic_display_name が空白のみなら clinics.name にフォールバックする", () => {
    expect(resolvePatientFacingClinicName({ clinicDisplayName: "   " }, { name: "クリニックA" })).toBe("クリニックA");
  });

  it("両方空なら空文字を返す", () => {
    expect(resolvePatientFacingClinicName({ clinicDisplayName: "" }, { name: "" })).toBe("");
    expect(resolvePatientFacingClinicName(null, null)).toBe("");
  });
});

describe("resolvePatientFacingClinicPhone", () => {
  it("clinic_profile.phone が設定されていればそれを使う", () => {
    expect(resolvePatientFacingClinicPhone({ phone: "03-1111-2222" }, { phone: "03-9999-9999" })).toBe("03-1111-2222");
  });

  it("clinic_profile.phone が空白のみなら clinics.phone にフォールバックする", () => {
    expect(resolvePatientFacingClinicPhone({ phone: " " }, { phone: "03-9999-9999" })).toBe("03-9999-9999");
  });

  it("両方空なら空文字を返す", () => {
    expect(resolvePatientFacingClinicPhone({ phone: "" }, { phone: "" })).toBe("");
    expect(resolvePatientFacingClinicPhone(null, null)).toBe("");
  });
});
