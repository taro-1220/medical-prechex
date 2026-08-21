// MVP+1: キャンセルポリシー適用判定・妥当性ガード（純粋関数のみ。DB/Stripeには触れない）

export type TreatmentCategory = "insurance" | "private" | "other";
export type CancelPolicyScope = "private" | "insurance" | "both";

export interface CancelPolicySettings {
  enabled: boolean;
  scope: CancelPolicyScope | null;
}

/** scope が対象カテゴリを含むか。'other' はどの scope でも対象外 */
export function scopeAppliesToCategory(scope: CancelPolicyScope, category: TreatmentCategory): boolean {
  if (category === "other") return false;
  if (scope === "both") return true;
  return scope === category;
}

/**
 * 適用判定。manualOverride（スタッフが予約単位で指定）が null 以外なら常にそれを優先する。
 * cancel_policy_enabled=false の場合は override に関わらず適用しない（UIに一切表示しない、という
 * 絶対制約を判定関数側でも保証する）。
 */
export function resolveCancelPolicyApplication(
  settings: CancelPolicySettings,
  category: TreatmentCategory,
  manualOverride: boolean | null,
): boolean {
  if (!settings.enabled) return false;
  if (manualOverride !== null) return manualOverride;
  if (!settings.scope) return false;
  return scopeAppliesToCategory(settings.scope, category);
}

/** 予約作成（=grace_hours の起点）から grace_hours 以内なら常に無料対象 */
export function isWithinGraceHours(createdAt: string, now: string, graceHours: number): boolean {
  const createdMs = new Date(createdAt).getTime();
  const nowMs = new Date(now).getTime();
  const hoursSince = (nowMs - createdMs) / (1000 * 60 * 60);
  return hoursSince <= graceHours;
}

// 実際の損害を超える可能性がある表現。保存はブロックせず警告のみに使う
const RISKY_POLICY_WORDS: readonly string[] = ["全額", "100%", "100％", "違約金", "罰金"];

/** policy_text に含まれる要警告語をすべて返す（無ければ空配列） */
export function findRiskyPolicyWording(text: string): string[] {
  return RISKY_POLICY_WORDS.filter((w) => text.includes(w));
}

/** basis_note は必須。空白のみも不可 */
export function isBasisNoteValid(basisNote: string): boolean {
  return basisNote.trim().length > 0;
}

/** scope が insurance を含む場合のみ、保険同意チェックが必須 */
export function isInsuranceAcknowledgmentSatisfied(scope: CancelPolicyScope, acknowledged: boolean): boolean {
  if (scope === "insurance" || scope === "both") return acknowledged;
  return true;
}

/**
 * 既存オンボーディングの「キャンセルポリシー」ステップ（clinic_profile.cancellation_policy）の完了判定。
 * 従来は保存＝無条件完了だった欠陥を修正: 本文が空なら未完了。ただしキャンセル料ポリシー機能
 * （cancel_policy_enabled）を使わない医院に本文記入を強制しないため、無効時は空でも完了扱いにする。
 */
export function isGeneralPolicyStepComplete(cancellationPolicyText: string, cancelPolicyEnabled: boolean): boolean {
  return cancellationPolicyText.trim().length > 0 || !cancelPolicyEnabled;
}
