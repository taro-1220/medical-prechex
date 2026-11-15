// AppointmentRow.tsx の副作用の無い表示ロジック（JSXを含まないため直接テストできる）。
// tsconfig.json の jsx:"preserve" により、JSXを含む.tsxをvitestが単体で解析できないための分離。
import type { Appointment, AppointmentStatus, StripeAccountStatus } from "@/lib/types";
import { formatJstDateTime } from "@/lib/datetime-display";
import { isExpiredUnconfirmed } from "@/lib/clinic-appointments-view";

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmation_pending: "同意待ち",
  confirmed: "確認済み",
  ticket_issued: "確認済み",
  checked_in: "来院済み",
  completed: "完了",
  cancelled: "キャンセル",
  expired: "期限切れ",
};

export const STATUS_COLOR: Record<AppointmentStatus, string> = {
  confirmation_pending: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-teal-100 text-teal-700",
  ticket_issued: "bg-teal-100 text-teal-700",
  checked_in: "bg-emerald-100 text-emerald-700",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-gray-100 text-gray-400",
  expired: "bg-gray-100 text-gray-400",
};

export function formatDate(iso: string) {
  return formatJstDateTime(iso, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const isCancelled = (s: AppointmentStatus) => s === "cancelled" || s === "expired";

/**
 * Phase J セクションC: 一覧の「要対応」判定。時系列より上に固定表示する対象を決める。
 * 期限切れ（未同意のまま予約時刻を過ぎた予約）は要対応に出さない。
 * stripeAccountStatusを渡さない呼び出し元は既存どおり（"active"扱い＝カード未登録を出す）。
 */
export function attentionReasons(
  a: Appointment,
  nowIso: string,
  stripeAccountStatus: StripeAccountStatus | null | undefined = "active",
): string[] {
  if (isExpiredUnconfirmed(a.status, a.appointmentAt, nowIso)) return [];
  const reasons: string[] = [];
  if (
    a.cardRegistrationRequired &&
    !a.stripePaymentMethodId &&
    !isCancelled(a.status) &&
    a.status !== "completed" &&
    stripeAccountStatus === "active"
  ) {
    reasons.push("カード未登録");
  }
  if (a.chargeStatus === "failed") reasons.push("請求失敗");
  if (a.chargeStatus === "requires_action") reasons.push("要再認証");
  return reasons;
}

export type ConfirmProgress = { state: "not_sent" } | { state: "sent" } | { state: "viewed"; viewedAt: string };

/** 同意待ちの進み具合。既存の送信記録(手動申告・自動送信)とconfirm_page_first_viewed_atから判定する */
export function confirmProgress(a: Appointment): ConfirmProgress {
  if (a.confirmPageFirstViewedAt) return { state: "viewed", viewedAt: a.confirmPageFirstViewedAt };
  if (a.lineSentAt || a.smsSentAt || a.emailSentAt) return { state: "sent" };
  return { state: "not_sent" };
}
