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

/** clinic_usersのrole（運営者向け画面・医院向け画面で共通） */
export const ROLE_LABEL: Record<string, string> = {
  owner: "オーナー",
  manager: "マネージャ",
  staff: "スタッフ",
};

/** 通知チャネル（line/sms/email）の表示名 */
export const CHANNEL_LABEL: Record<string, string> = {
  line: "LINE",
  sms: "SMS",
  email: "メール",
};

/**
 * onboarding_progressテーブルの列名→日本語ラベル（運営者向け画面の医院詳細で使用）。
 * id・clinic_idは呼び出し側で除外する前提のため、ここには含めない。
 */
export const ONBOARDING_PROGRESS_FIELD_LABEL: Record<string, string> = {
  profile_completed: "医院情報の入力",
  policy_completed: "キャンセルポリシーの設定",
  notification_completed: "通知設定",
  activated_at: "利用開始日時",
  created_at: "作成日時",
  updated_at: "更新日時",
};

/**
 * clinic_profileテーブルの列名→日本語ラベル（運営者向け画面の医院詳細で使用）。
 * id・clinic_idは呼び出し側で除外する前提のため、ここには含めない。
 */
export const CLINIC_PROFILE_FIELD_LABEL: Record<string, string> = {
  clinic_display_name: "表示名",
  director_name: "院長名",
  phone: "電話番号",
  email: "メールアドレス",
  postal_code: "郵便番号",
  address: "住所",
  website_url: "ウェブサイトURL",
  cancellation_policy: "キャンセルポリシー文面",
  default_message: "既定メッセージ（旧設定）",
  cancel_policy_enabled: "キャンセル料回収の有効化",
  cancel_policy_scope: "キャンセル料の適用範囲",
  cancel_policy_insurance_acknowledged: "保険診療の注意事項確認",
  stripe_account_id: "Stripeアカウント ID",
  stripe_account_status: "Stripe接続状況",
  auto_notify_available_slot: "空き枠自動通知",
  created_at: "作成日時",
  updated_at: "更新日時",
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

export function getRoleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

export function getChannelLabel(channel: string): string {
  return CHANNEL_LABEL[channel] ?? channel;
}

/**
 * onboarding_progressの列名のラベル。マップに無いキーはnull
 * （呼び出し側で「（未定義の項目）」＋生のキー名の併記表示に使う）。
 */
export function getOnboardingProgressFieldLabel(key: string): string | null {
  return ONBOARDING_PROGRESS_FIELD_LABEL[key] ?? null;
}

/**
 * clinic_profileの列名のラベル。マップに無いキーはnull
 * （呼び出し側で「（未定義の項目）」＋生のキー名の併記表示に使う）。
 */
export function getClinicProfileFieldLabel(key: string): string | null {
  return CLINIC_PROFILE_FIELD_LABEL[key] ?? null;
}
