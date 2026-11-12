// 予約「内容」の選択肢（clinic_profile.appointment_description_options）に関する、
// 副作用の無い定数・純関数のみ。DBアクセスは appointment-description-options-store.ts に分離する
// （"use client" コンポーネントから直接importしても、サーバー専用のSupabaseクライアントを含めないため）。

export const DEFAULT_APPOINTMENT_DESCRIPTION_OPTIONS = ["初診", "再診（治療の続き）", "定期検診・クリーニング", "相談"];

export function isValidAppointmentDescriptionLabel(label: string): boolean {
  return label.length >= 1 && label.length <= 20;
}
