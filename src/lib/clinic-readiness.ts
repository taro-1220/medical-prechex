// 患者向けの予約作成・送信を行う前に、クリニックの必須設定が揃っているかを判定する純関数。
// 判定に使うのは clinic_profile の3列（クリニック名・電話番号・キャンセルポリシー）のみ。

export interface PatientFacingClinicProfile {
  clinicDisplayName?: string | null;
  phone?: string | null;
  cancellationPolicy?: string | null;
}

/** 未設定（trim後に空）の項目名を返す。全て設定済みなら空配列 */
export function missingPatientFacingSettings(profile: PatientFacingClinicProfile | null | undefined): string[] {
  const missing: string[] = [];
  if (!profile?.clinicDisplayName?.trim()) missing.push("クリニック名");
  if (!profile?.phone?.trim()) missing.push("電話番号");
  if (!profile?.cancellationPolicy?.trim()) missing.push("キャンセルポリシー");
  return missing;
}

export function missingPatientFacingSettingsMessage(missing: string[]): string {
  return `予約を作成する前に、医院設定で次の項目を設定してください：${missing.join("、")}`;
}
