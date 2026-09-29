import type { AppointmentStatus, ChargeStatus, ClinicStatus, StripeAccountStatus } from "./types";

/**
 * 状態値の日本語表示名を1か所にまとめる。運営者向け画面（/ops）・医院向け画面が
 * 共通してここを参照する。未知の値が来てもエラーにせず、生の値をそのまま返す
 * （新しい状態値が増えてもこのモジュールの更新が追いつくまで画面が壊れないため）。
 */

export const CLINIC_STATUS_LABEL: Record<ClinicStatus, string> = {
  active: "承認済み",
  pending_approval: "承認待ち",
  rejected: "却下",
};

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmation_pending: "確認待ち",
  confirmed: "確認済み",
  ticket_issued: "確認済み",
  checked_in: "来院済み",
  completed: "完了",
  cancelled: "キャンセル",
  expired: "期限切れ",
};

export const CHARGE_STATUS_LABEL: Record<ChargeStatus, string> = {
  none: "対象外",
  charged: "請求済み",
  failed: "請求失敗",
  requires_action: "要再認証",
  written_off: "請求断念",
};

export const STRIPE_ACCOUNT_STATUS_LABEL: Record<StripeAccountStatus, string> = {
  not_connected: "未接続",
  pending: "手続き中",
  active: "有効",
};

function labelOrRaw(map: Record<string, string>, value: string | null | undefined, fallbackForNil: string): string {
  if (value == null) return fallbackForNil;
  return map[value] ?? value;
}

export function getClinicStatusLabel(status: string | null | undefined): string {
  return labelOrRaw(CLINIC_STATUS_LABEL, status, "—");
}

export function getAppointmentStatusLabel(status: string | null | undefined): string {
  return labelOrRaw(APPOINTMENT_STATUS_LABEL, status, "—");
}

export function getChargeStatusLabel(status: string | null | undefined): string {
  return labelOrRaw(CHARGE_STATUS_LABEL, status, CHARGE_STATUS_LABEL.none);
}

export function getStripeAccountStatusLabel(status: string | null | undefined): string {
  return labelOrRaw(STRIPE_ACCOUNT_STATUS_LABEL, status, STRIPE_ACCOUNT_STATUS_LABEL.not_connected);
}
