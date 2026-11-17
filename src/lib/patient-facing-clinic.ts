// 患者に出すクリニック名・電話番号の解決規則（共通）。
// clinic_profile（医院が自分で編集する現在設定）を優先し、空なら clinics（登録時の基礎情報）にフォールバックする。

export interface PatientFacingClinicProfileFields {
  clinicDisplayName?: string | null;
  phone?: string | null;
}

export interface PatientFacingClinicFields {
  name?: string | null;
  phone?: string | null;
}

export function resolvePatientFacingClinicName(
  profile: PatientFacingClinicProfileFields | null | undefined,
  clinic: PatientFacingClinicFields | null | undefined,
): string {
  const fromProfile = profile?.clinicDisplayName?.trim();
  if (fromProfile) return fromProfile;
  return clinic?.name?.trim() ?? "";
}

export function resolvePatientFacingClinicPhone(
  profile: PatientFacingClinicProfileFields | null | undefined,
  clinic: PatientFacingClinicFields | null | undefined,
): string {
  const fromProfile = profile?.phone?.trim();
  if (fromProfile) return fromProfile;
  return clinic?.phone?.trim() ?? "";
}
