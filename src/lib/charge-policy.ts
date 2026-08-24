// MVP+2: キャンセルポリシーに基づく回収の判定ロジック（純粋関数のみ。Stripe/DBには触れない）
//
// 金額のテンプレート初期値はここに一切持たない。tiersは医院が入力した値をそのまま使う。

import { isWithinGraceHours } from "./cancel-policy";

export interface CancelTier {
  /** 「n日前まで」。no_showとは排他 */
  daysBefore?: number;
  /** 無断不来院用の段階。daysBeforeとは排他 */
  noShow?: boolean;
  /** 0〜100 */
  percent: number;
}

export type TierMatchReason = "grace_hours" | "tier" | "no_matching_tier" | "no_show_tier_missing";

export interface TierMatchResult {
  reason: TierMatchReason;
  /** 該当した段階（grace_hours適用時・未該当時はnull） */
  matchedTier: CancelTier | null;
  percent: number;
}

/** tiersのうち days_before を持つものだけを、大きい順（=期限が早い＝%が低い側から）に並べる */
function sortedDaysBeforeTiers(tiers: CancelTier[]): CancelTier[] {
  return tiers
    .filter((t): t is CancelTier & { daysBefore: number } => typeof t.daysBefore === "number")
    .sort((a, b) => b.daysBefore! - a.daysBefore!);
}

function findNoShowTier(tiers: CancelTier[]): CancelTier | null {
  return tiers.find((t) => t.noShow === true) ?? null;
}

/**
 * 予約日時から見て「何日前」に発生した事象か（キャンセル記録 or 無断判定の実行時刻）。
 * 端数は日単位の小数のまま扱う（暦日の丸めはしない。3.9日前は「3日前まで」の閾値を満たさない）。
 */
export function daysBeforeAppointment(appointmentAt: string, eventAt: string): number {
  const ms = new Date(appointmentAt).getTime() - new Date(eventAt).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

/**
 * 段階テーブルからの該当判定（grace_hoursを最優先）。
 * - grace_hours以内 → 無条件で無料（percent=0, reason='grace_hours'）
 * - 無断不来院 → no_show段階のみ見る。未設定なら'no_show_tier_missing'（請求しない）
 * - 通常キャンセル → daysBeforeの降順で、実測日数がその閾値以上になる最初の段階を採用。
 *   該当が無ければ'no_matching_tier'（請求しない。0%を勝手に補わない）
 */
export function resolveCancelTier(params: {
  tiers: CancelTier[] | null | undefined;
  appointmentAt: string;
  createdAt: string;
  eventAt: string;
  graceHours: number;
  isNoShow: boolean;
}): TierMatchResult {
  const { tiers, appointmentAt, createdAt, eventAt, graceHours, isNoShow } = params;

  if (isWithinGraceHours(createdAt, eventAt, graceHours)) {
    return { reason: "grace_hours", matchedTier: null, percent: 0 };
  }

  const list = tiers ?? [];

  if (isNoShow) {
    const tier = findNoShowTier(list);
    if (!tier) return { reason: "no_show_tier_missing", matchedTier: null, percent: 0 };
    return { reason: "tier", matchedTier: tier, percent: tier.percent };
  }

  const actualDaysBefore = daysBeforeAppointment(appointmentAt, eventAt);
  const ladder = sortedDaysBeforeTiers(list);
  for (const tier of ladder) {
    if (actualDaysBefore >= tier.daysBefore!) {
      return { reason: "tier", matchedTier: tier, percent: tier.percent };
    }
  }
  return { reason: "no_matching_tier", matchedTier: null, percent: 0 };
}

/** percent×base_amount の請求額（円）。端数切り捨て */
export function computeChargeAmount(baseAmount: number, percent: number): number {
  return Math.floor((baseAmount * percent) / 100);
}

export interface ChargeEligibilityInput {
  cancelPolicyApplied: boolean;
  cancelPolicyAgreedAt: string | null | undefined;
  withinGraceHours: boolean;
  hasPaymentMethod: boolean;
  chargeExecutionEnabled: boolean;
}

export interface ChargeEligibilityResult {
  eligible: boolean;
  /** 満たされていない条件（UIでの理由表示用） */
  blockedBy: Array<"not_consented" | "within_grace_hours" | "no_payment_method" | "flag_disabled">;
}

/** 課金の成立条件: 同意済み ∧ grace_hours外 ∧ カード登録済み ∧ フラグtrue のAND判定 */
export function evaluateChargeEligibility(input: ChargeEligibilityInput): ChargeEligibilityResult {
  const blockedBy: ChargeEligibilityResult["blockedBy"] = [];
  if (!input.cancelPolicyApplied || !input.cancelPolicyAgreedAt) blockedBy.push("not_consented");
  if (input.withinGraceHours) blockedBy.push("within_grace_hours");
  if (!input.hasPaymentMethod) blockedBy.push("no_payment_method");
  if (!input.chargeExecutionEnabled) blockedBy.push("flag_disabled");
  return { eligible: blockedBy.length === 0, blockedBy };
}

/** tiers内のpercentが0〜100の範囲か（保存前のクライアント側バリデーション。DB側にも同等のCHECKあり） */
export function areTierPercentsValid(tiers: CancelTier[]): boolean {
  return tiers.every((t) => typeof t.percent === "number" && t.percent >= 0 && t.percent <= 100);
}
