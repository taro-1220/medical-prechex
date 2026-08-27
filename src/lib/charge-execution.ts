// MVP+2: キャンセル/無断発生時の課金オーケストレーション（DB・Stripeに触れる。非純粋関数）
// 純粋な判定ロジックは charge-policy.ts に集約し、ここでは呼び出し順序のみを扱う。

import type { Appointment, CancelTier, ChargeStatus, ChargeEventActor } from "./types";
import {
  resolveCancelTier,
  computeChargeAmount,
  evaluateChargeEligibility,
} from "./charge-policy";
import { isChargeExecutionEnabled, executeOffSessionCharge } from "./stripe";
import { insertChargeEvent, recordChargeResult, findSuccessfulChargeEvent, type ExistingCharge } from "./charge-store";
import { NO_SHOW_DETAIL_PREFIX } from "./dashboard";

export interface ChargeAttemptContext {
  appointment: Appointment;
  clinicStripeAccountId: string | null;
  tiers: CancelTier[] | null;
  graceHours: number;
  isNoShow: boolean;
  /** キャンセル記録・無断判定が発生した時刻 */
  eventAt: string;
  actor: ChargeEventActor;
}

export interface ChargeAttemptResult {
  reason: ReturnType<typeof resolveCancelTier>["reason"];
  percent: number;
  amount: number;
  eligible: boolean;
  blockedBy: string[];
  executed: boolean;
  dryRun: boolean;
  chargeStatus: ChargeStatus | null;
  paymentIntentId?: string;
  /** Phase J: 既に成功課金が存在する場合、その記録（判定根拠の提示用） */
  existingCharge?: ExistingCharge | null;
}

/**
 * 判定→成立条件確認→（フラグON時のみ）Stripe課金→結果記録、を一括で行う。
 * 呼び出し元: 患者/スタッフのキャンセル記録（E-1）、無断判定cron（E-2）、失敗リトライ（E-3）。
 */
export async function attemptCancelCharge(ctx: ChargeAttemptContext): Promise<ChargeAttemptResult> {
  const appt = ctx.appointment;
  const tierMatch = resolveCancelTier({
    tiers: ctx.tiers,
    appointmentAt: appt.appointmentAt,
    createdAt: appt.createdAt,
    eventAt: ctx.eventAt,
    graceHours: ctx.graceHours,
    isNoShow: ctx.isNoShow,
  });
  const withinGraceHours = tierMatch.reason === "grace_hours";
  const chargeExecutionEnabled = isChargeExecutionEnabled();
  const dryRun = !chargeExecutionEnabled;

  // Phase J セクション0: 重複課金防止。charge_eventsの実課金記録（dry_run=false）の有無を判定根拠にする
  // （appt.chargeStatusはrecordChargeResultの後勝ち上書きのため単独の根拠にしない）
  const existingCharge = await findSuccessfulChargeEvent(appt.id);
  const alreadyCharged = !!existingCharge;

  // 報告・判定パネル用（フラグの状態も含めた「今まさに成立するか」）
  const eligibility = evaluateChargeEligibility({
    cancelPolicyApplied: appt.cancelPolicyApplied,
    cancelPolicyAgreedAt: appt.cancelPolicyAgreedAt ?? null,
    withinGraceHours,
    hasPaymentMethod: !!appt.stripePaymentMethodId,
    chargeExecutionEnabled,
    alreadyCharged,
  });
  // ドライラン分岐に進めるかどうかの判定（フラグ以外の実条件のみ。フラグOFFはドライランする
  // 理由であって「実行しない」理由ではないため、ここには含めない）
  const readyToAttempt = evaluateChargeEligibility({
    cancelPolicyApplied: appt.cancelPolicyApplied,
    cancelPolicyAgreedAt: appt.cancelPolicyAgreedAt ?? null,
    withinGraceHours,
    hasPaymentMethod: !!appt.stripePaymentMethodId,
    chargeExecutionEnabled: true,
    alreadyCharged,
  });
  const amount = appt.baseAmount != null ? computeChargeAmount(appt.baseAmount, tierMatch.percent) : 0;
  const noShowPrefix = ctx.isNoShow ? NO_SHOW_DETAIL_PREFIX + " " : "";

  const base: ChargeAttemptResult = {
    reason: tierMatch.reason, percent: tierMatch.percent, amount,
    eligible: eligibility.eligible, blockedBy: eligibility.blockedBy,
    executed: false, dryRun, chargeStatus: null, existingCharge,
  };

  // 請求額が0（grace_hours・0%段階・非該当）なら何もしない。証跡も残さない（課金事象ではないため）
  if (amount <= 0) return base;

  // フラグ以外の実条件を満たさない（同意なし/カード未登録等）→ 実行せず記録のみ
  if (!readyToAttempt.eligible) {
    await insertChargeEvent({
      appointmentId: appt.id, clinicId: appt.clinicId!, eventType: "notice",
      amount, actor: ctx.actor, dryRun,
      detail: `${noShowPrefix}未実行(${tierMatch.percent}%・${amount}円): ${readyToAttempt.blockedBy.join(",")}`,
    });
    return base;
  }

  if (dryRun) {
    await insertChargeEvent({
      appointmentId: appt.id, clinicId: appt.clinicId!, eventType: "charge",
      amount, actor: ctx.actor, dryRun: true,
      detail: `${noShowPrefix}ドライラン(${tierMatch.percent}%)`,
    });
    return base;
  }

  // ここから実課金（ENABLE_CHARGE_EXECUTION=true のときのみ到達）
  const result = await executeOffSessionCharge({
    connectedAccountId: ctx.clinicStripeAccountId!,
    paymentMethodId: appt.stripePaymentMethodId!,
    amountJpy: amount,
    appointmentId: appt.id,
    description: `${appt.clinicName} キャンセル料（${tierMatch.percent}%）`,
    // Phase K: カードIDをキーに含める（同一カードの重複実行は同じキー＝Stripe側でも重複排除、
    // カード変更後の再試行は別キー＝新規リクエストとして正しく通す）
    idempotencyKey: `${appt.id}:charge:${appt.stripePaymentMethodId}`,
  });

  // Phase K: カード拒否以外の例外（ネットワーク障害・idempotency_error等）。PaymentIntent自体が
  // 作れていないため、appt.chargeStatusは'failed'にしつつfailure_kind='system_error'で区別する
  if ("systemError" in result) {
    await recordChargeResult(appt.id, {
      chargeStatus: "failed",
      chargedAmount: amount,
      chargeExecutedAt: ctx.eventAt,
    });
    await insertChargeEvent({
      appointmentId: appt.id, clinicId: appt.clinicId!, eventType: "failure", failureKind: "system_error",
      amount, actor: ctx.actor, dryRun: false,
      detail: `${noShowPrefix}システムエラー: ${result.errorMessage}`,
    });
    return { ...base, executed: false, dryRun: false, chargeStatus: "failed" };
  }

  const chargeStatus: ChargeStatus = result.requiresAction
    ? "requires_action"
    : result.status === "succeeded" ? "charged" : "failed";

  await recordChargeResult(appt.id, {
    stripePaymentIntentId: result.paymentIntentId,
    chargeStatus,
    // 成否に関わらず試行額を残す（failedの場合、翌日リトライが同額で再試行するために必要）
    chargedAmount: amount,
    chargeExecutedAt: ctx.eventAt,
  });
  await insertChargeEvent({
    appointmentId: appt.id, clinicId: appt.clinicId!,
    eventType: chargeStatus === "failed" ? "failure" : "charge",
    failureKind: chargeStatus === "failed" ? "card_declined" : null,
    amount, stripeReferenceId: result.paymentIntentId, actor: ctx.actor, dryRun: false,
    detail: `${noShowPrefix}${tierMatch.percent}% (${chargeStatus})`,
  });

  return { ...base, executed: true, dryRun: false, chargeStatus, paymentIntentId: result.paymentIntentId };
}

/**
 * E-3: 課金失敗の自動リトライ（翌日1回のみ。呼び出し側が「まだretryイベントが無いか」を
 * 確認してから呼ぶ）。同一の試行額（appt.chargedAmount）で再試行する。
 */
export async function attemptRetryCharge(
  appt: Appointment,
  clinicStripeAccountId: string,
): Promise<{ attempted: boolean; dryRun: boolean; chargeStatus: ChargeStatus | null }> {
  if (!appt.stripePaymentMethodId || appt.chargedAmount == null || appt.chargedAmount <= 0) {
    return { attempted: false, dryRun: !isChargeExecutionEnabled(), chargeStatus: null };
  }
  const dryRun = !isChargeExecutionEnabled();
  const now = new Date().toISOString();

  if (dryRun) {
    await insertChargeEvent({
      appointmentId: appt.id, clinicId: appt.clinicId!, eventType: "retry",
      amount: appt.chargedAmount, actor: "system", dryRun: true, detail: "ドライラン再試行",
    });
    return { attempted: false, dryRun: true, chargeStatus: null };
  }

  const result = await executeOffSessionCharge({
    connectedAccountId: clinicStripeAccountId,
    paymentMethodId: appt.stripePaymentMethodId,
    amountJpy: appt.chargedAmount,
    appointmentId: appt.id,
    description: `${appt.clinicName} キャンセル料（再請求）`,
    // E-3は「retryイベント不在チェック」により生涯1回のみ呼ばれるため、charge用キーと衝突しない
    // （Phase K-Aのカード単位キー化はattemptCancelCharge側のみで、ここは変更しない）
    idempotencyKey: `${appt.id}:retry`,
  });

  // Phase K: リトライ自体がシステムエラーで失敗した場合も、eventType='retry'のまま記録する
  // （failure_kindはevent_type='failure'専用のDB制約があるため、ここでは常にnullのまま）
  if ("systemError" in result) {
    await recordChargeResult(appt.id, {
      chargeStatus: "failed",
      chargedAmount: appt.chargedAmount,
      chargeExecutedAt: now,
    });
    await insertChargeEvent({
      appointmentId: appt.id, clinicId: appt.clinicId!, eventType: "retry",
      amount: appt.chargedAmount, actor: "system", dryRun: false,
      detail: `再試行結果: システムエラー: ${result.errorMessage}`,
    });
    return { attempted: true, dryRun: false, chargeStatus: "failed" };
  }

  const chargeStatus: ChargeStatus = result.requiresAction
    ? "requires_action"
    : result.status === "succeeded" ? "charged" : "failed";

  await recordChargeResult(appt.id, {
    stripePaymentIntentId: result.paymentIntentId,
    chargeStatus,
    chargedAmount: appt.chargedAmount,
    chargeExecutedAt: now,
  });
  await insertChargeEvent({
    appointmentId: appt.id, clinicId: appt.clinicId!, eventType: "retry",
    amount: appt.chargedAmount, stripeReferenceId: result.paymentIntentId,
    actor: "system", dryRun: false, detail: `再試行結果: ${chargeStatus}`,
  });

  return { attempted: true, dryRun: false, chargeStatus };
}
