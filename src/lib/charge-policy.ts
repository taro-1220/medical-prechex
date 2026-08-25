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

// ---------------------------------------------------------------------------
// Phase G P0: 締切の絶対日時化・本文とtiersの整合チェック（追加のみ。上記の既存関数は変更しない）
// ---------------------------------------------------------------------------

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** percent=0の段階のうち最小のdaysBeforeを返す（無ければnull） */
function minFreeDaysBefore(tiers: CancelTier[] | null | undefined): number | null {
  const freeDaysBefore = (tiers ?? [])
    .filter((t): t is CancelTier & { daysBefore: number } => typeof t.daysBefore === "number" && t.percent === 0)
    .map((t) => t.daysBefore);
  return freeDaysBefore.length === 0 ? null : Math.min(...freeDaysBefore);
}

/**
 * tiersが定める「無料キャンセル期限」の絶対日時（ISO・UTC文字列で返す。呼び出し側は
 * 従来どおりDateに渡して表示すればよい）。
 * percent=0の段階のうちdaysBeforeが最小のものを採用する
 * （ラダー判定の性質上、実際の無料/有料の境界はそこで決まるため。0%段階が複数あっても同じ結果になる）。
 * percent=0の段階が無ければ null（tiersだけでは無料期間が無い）。
 *
 * 日境界はAsia/Tokyo固定（+9時間、DST無し）で算出する: 予約日（JST）からminDaysBefore日引いた日の
 * 23:59:59 JSTを締切とする。ただしminDaysBefore=0（当日が0%）の場合は日境界にせず、
 * appointmentAtそのものを締切として返す（「当日23:59まで無料」という誤った意味にしないため）。
 */
export function computeFreeCancellationDeadline(appointmentAt: string, tiers: CancelTier[] | null | undefined): string | null {
  const minDaysBefore = minFreeDaysBefore(tiers);
  if (minDaysBefore === null) return null;
  if (minDaysBefore === 0) return new Date(appointmentAt).toISOString();

  // JST壁時計の年月日を得る（固定+9hシフトしてUTCゲッターで読む、という標準的な手法。DST非対応地域なので安全）
  const apptJstWallClock = new Date(new Date(appointmentAt).getTime() + JST_OFFSET_MS);
  const deadlineJstMidnightUtcMs = Date.UTC(
    apptJstWallClock.getUTCFullYear(),
    apptJstWallClock.getUTCMonth(),
    apptJstWallClock.getUTCDate() - minDaysBefore,
    23, 59, 59, 0,
  );
  return new Date(deadlineJstMidnightUtcMs - JST_OFFSET_MS).toISOString();
}

/**
 * 予約確認ポリシー本文（自由記述）から「n日前」「前日」「当日」の締切表現を抽出する。
 * 見つからなければ null（本文に具体的な日数表現が無いだけであり、矛盾とは判定しない）。
 * 複数該当する場合は本文中で最初に出現したものを採用する。
 */
export function extractStatedDeadlineDaysBefore(policyText: string): number | null {
  const match = policyText.match(/(\d+)\s*日前|前日|当日/);
  if (!match) return null;
  if (match[0] === "当日") return 0;
  if (match[0] === "前日") return 1;
  return Number(match[1]);
}

export interface PolicyTierConsistencyResult {
  /** 本文・tiersの双方から締切日数を抽出できて、かつ値が異なる場合のみtrue */
  mismatched: boolean;
  statedDaysBefore: number | null;
  tierDaysBefore: number | null;
}

/**
 * 予約確認ポリシー本文とtiersの無料境界が矛盾していないかを検証する。
 * 抽出できない側があれば mismatched=false（誤検出よりも「警告しない」を優先する。Gate 0で承認済みの方針）。
 */
export function checkPolicyTierConsistency(
  policyText: string,
  tiers: CancelTier[] | null | undefined,
): PolicyTierConsistencyResult {
  const statedDaysBefore = extractStatedDeadlineDaysBefore(policyText);
  const tierDaysBefore = minFreeDaysBefore(tiers);
  const mismatched = statedDaysBefore != null && tierDaysBefore != null && statedDaysBefore !== tierDaysBefore;
  return { mismatched, statedDaysBefore, tierDaysBefore };
}

/** 金額を3桁区切りの円表示にする（例: 5000 → "5,000円"） */
export function formatYen(amount: number): string {
  return `${amount.toLocaleString("ja-JP")}円`;
}

/**
 * 段階の表示文言。基準額があれば「5,000円（治療費の50%）」、無ければ「50%」にフォールバックする。
 */
export function formatTierAmount(percent: number, baseAmount: number | null | undefined): string {
  if (baseAmount == null) return `${percent}%`;
  if (percent === 0) return "無料";
  return `${formatYen(computeChargeAmount(baseAmount, percent))}（治療費の${percent}%）`;
}
