// Phase J セクション0: attemptCancelCharge/attemptRetryChargeのオーケストレーション検証。
// DB(charge-store)・Stripe(stripe)は非純粋関数のためモックする。判定ロジック本体（charge-policy.ts）は
// charge-policy.test.tsで別途検証済み。ここでは「重複課金ガード」「idempotencyKey」「cron/リトライとの独立性」を見る。
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Appointment, CancelTier } from "./types";

const insertChargeEventMock = vi.fn();
const recordChargeResultMock = vi.fn();
const findSuccessfulChargeEventMock = vi.fn();

vi.mock("./charge-store", () => ({
  insertChargeEvent: (...args: unknown[]) => insertChargeEventMock(...args),
  recordChargeResult: (...args: unknown[]) => recordChargeResultMock(...args),
  findSuccessfulChargeEvent: (...args: unknown[]) => findSuccessfulChargeEventMock(...args),
}));

const executeOffSessionChargeMock = vi.fn();
let chargeExecutionEnabled = true;

vi.mock("./stripe", () => ({
  isChargeExecutionEnabled: () => chargeExecutionEnabled,
  executeOffSessionCharge: (...args: unknown[]) => executeOffSessionChargeMock(...args),
}));

const { attemptCancelCharge, attemptRetryCharge } = await import("./charge-execution");

const TIERS: CancelTier[] = [{ daysBefore: 3, percent: 0 }, { daysBefore: 0, percent: 100 }, { noShow: true, percent: 100 }];

const BASE_APPT: Appointment = {
  id: "appt-1",
  token: "tok-1",
  clinicName: "検収クリニック",
  patientName: "検収 太郎",
  phone: "",
  email: "",
  communicationChannel: "manual",
  appointmentAt: "2026-09-01T09:00:00.000Z",
  description: "定期検診",
  cancellationPolicy: "",
  status: "confirmed",
  clinicId: "clinic-1",
  patientId: "patient-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  treatmentCategory: "private",
  cancelPolicyApplied: true,
  cancelPolicyAgreedAt: "2026-01-01T00:00:00.000Z",
  baseAmount: 10000,
  cardRegistrationRequired: true,
  stripePaymentMethodId: "pm_123",
  chargeStatus: "none",
  chargedAmount: null,
};

function makeCtx(overrides: Partial<Parameters<typeof attemptCancelCharge>[0]> = {}) {
  return {
    appointment: BASE_APPT,
    clinicStripeAccountId: "acct_1",
    tiers: TIERS,
    graceHours: 1,
    isNoShow: false,
    eventAt: "2026-09-01T10:00:00.000Z", // 予約時刻より後（0日前tier・100%が該当）
    actor: "system" as const,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  chargeExecutionEnabled = true;
  executeOffSessionChargeMock.mockResolvedValue({ paymentIntentId: "pi_1", status: "succeeded", requiresAction: false });
});

describe("attemptCancelCharge: 重複課金ガード（0-4a）", () => {
  it("1回目は実課金し、2回目はalready_chargedで弾かれる（Stripe呼び出しは1回のみ）", async () => {
    findSuccessfulChargeEventMock.mockResolvedValueOnce(null); // 1回目: 記録なし
    const first = await attemptCancelCharge(makeCtx());
    expect(first.executed).toBe(true);
    expect(first.chargeStatus).toBe("charged");
    expect(executeOffSessionChargeMock).toHaveBeenCalledTimes(1);

    findSuccessfulChargeEventMock.mockResolvedValueOnce({ amount: 10000, chargedAt: "2026-09-01T10:00:01.000Z" }); // 2回目: 記録あり
    const second = await attemptCancelCharge(makeCtx());
    expect(second.eligible).toBe(false);
    expect(second.blockedBy).toContain("already_charged");
    expect(second.executed).toBe(false);
    expect(executeOffSessionChargeMock).toHaveBeenCalledTimes(1); // 増えていない
  });

  it("executeOffSessionChargeにidempotencyKey `${appointmentId}:charge` を渡す", async () => {
    findSuccessfulChargeEventMock.mockResolvedValueOnce(null);
    await attemptCancelCharge(makeCtx());
    expect(executeOffSessionChargeMock).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "appt-1:charge" }),
    );
  });
});

describe("attemptCancelCharge: cronのno_show課金後、スタッフのキャンセル記録が弾かれる（0-4b）", () => {
  it("cron(isNoShow:true)で課金済みのあと、スタッフ操作(isNoShow:false)は弾かれる", async () => {
    findSuccessfulChargeEventMock.mockResolvedValueOnce(null);
    const cronResult = await attemptCancelCharge(makeCtx({ isNoShow: true, actor: "system" }));
    expect(cronResult.executed).toBe(true);
    expect(cronResult.chargeStatus).toBe("charged");

    findSuccessfulChargeEventMock.mockResolvedValueOnce({ amount: 10000, chargedAt: "2026-09-01T10:00:01.000Z" });
    const staffResult = await attemptCancelCharge(makeCtx({ isNoShow: false, actor: "staff" }));
    expect(staffResult.eligible).toBe(false);
    expect(staffResult.blockedBy).toContain("already_charged");
    expect(staffResult.executed).toBe(false);
    expect(executeOffSessionChargeMock).toHaveBeenCalledTimes(1);
  });
});

describe("attemptRetryCharge: E-3リトライはalready_chargedの影響を受けない（0-4c）", () => {
  it("attemptCancelChargeがfailedになった後でも、attemptRetryChargeは実行される", async () => {
    executeOffSessionChargeMock.mockResolvedValueOnce({ paymentIntentId: "pi_fail", status: "requires_payment_method", requiresAction: false });
    findSuccessfulChargeEventMock.mockResolvedValueOnce(null);
    const failedAttempt = await attemptCancelCharge(makeCtx());
    expect(failedAttempt.chargeStatus).toBe("failed");

    // attemptRetryChargeはfindSuccessfulChargeEvent/evaluateChargeEligibilityを一切経由しないため、
    // 「既に成功課金が存在する」という理由では弾かれない（呼ばれてもいないことも確認する）
    executeOffSessionChargeMock.mockResolvedValueOnce({ paymentIntentId: "pi_retry", status: "succeeded", requiresAction: false });
    const apptForRetry: Appointment = { ...BASE_APPT, chargeStatus: "failed", chargedAmount: 10000 };
    const retryResult = await attemptRetryCharge(apptForRetry, "acct_1");
    expect(retryResult.attempted).toBe(true);
    expect(retryResult.chargeStatus).toBe("charged");
    expect(findSuccessfulChargeEventMock).toHaveBeenCalledTimes(1); // failedAttempt側の1回のみ（retryでは呼ばれない）
  });

  it("attemptRetryChargeはidempotencyKey `${appointmentId}:retry` を渡す", async () => {
    const apptForRetry: Appointment = { ...BASE_APPT, chargeStatus: "failed", chargedAmount: 10000 };
    await attemptRetryCharge(apptForRetry, "acct_1");
    expect(executeOffSessionChargeMock).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "appt-1:retry" }),
    );
  });
});

describe("attemptCancelCharge: dry-run（フラグOFF）時の2回目の扱い（0-4d）", () => {
  it("フラグOFFでは既存のドライラン記録はalready_chargedの根拠にならず、2回目も弾かれない", async () => {
    chargeExecutionEnabled = false;
    // ドライラン記録はdry_run=trueのためfindSuccessfulChargeEvent（dry_run=false限定）は常にnullを返す想定
    findSuccessfulChargeEventMock.mockResolvedValue(null);

    const first = await attemptCancelCharge(makeCtx());
    expect(first.dryRun).toBe(true);
    expect(first.blockedBy).not.toContain("already_charged");

    const second = await attemptCancelCharge(makeCtx());
    expect(second.dryRun).toBe(true);
    expect(second.blockedBy).not.toContain("already_charged");

    // Stripeは一度も呼ばれない（ドライランのため）。証跡は2回とも記録される（実害が無いため重複防止は行わない設計）
    expect(executeOffSessionChargeMock).not.toHaveBeenCalled();
    expect(insertChargeEventMock).toHaveBeenCalledTimes(2);
    expect(insertChargeEventMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ dryRun: true, eventType: "charge" }));
    expect(insertChargeEventMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ dryRun: true, eventType: "charge" }));
  });
});
