import { describe, it, expect } from "vitest";
import { computeChargeDashboard } from "./dashboard";
import type { Appointment, ChargeEvent } from "./types";

function appt(overrides: Partial<Appointment>): Appointment {
  return {
    id: "a1", token: "t1", clinicName: "c", patientName: "p", phone: "", email: "",
    communicationChannel: "manual", appointmentAt: "2026-09-01T00:00:00Z", description: "",
    cancellationPolicy: "", status: "confirmed", createdAt: "2026-08-01T00:00:00Z",
    treatmentCategory: "private", cancelPolicyApplied: true,
    baseAmount: 10000, cardRegistrationRequired: true, chargeStatus: "none", chargedAmount: null,
    ...overrides,
  };
}

function event(overrides: Partial<ChargeEvent>): ChargeEvent {
  return {
    id: "e1", appointmentId: "a1", clinicId: "c1", eventType: "charge", amount: 3000,
    stripeReferenceId: null, actor: "system", dryRun: false, detail: null, createdAt: "2026-09-02T00:00:00Z",
    ...overrides,
  };
}

describe("computeChargeDashboard", () => {
  it("空配列なら全て0", () => {
    const d = computeChargeDashboard([], []);
    expect(d).toEqual({
      totalAppointments: 0, cancelledCount: 0, cancelRate: 0, noShowCount: 0,
      collectedAmount: 0, collectedCount: 0, failedChargeCount: 0,
      policyAppliedCancelRate: 0, policyNotAppliedCancelRate: 0,
    });
  });

  it("キャンセル率を計算する", () => {
    const appts = [appt({ id: "1", status: "cancelled" }), appt({ id: "2", status: "confirmed" }), appt({ id: "3", status: "completed" }), appt({ id: "4", status: "completed" })];
    const d = computeChargeDashboard(appts, []);
    expect(d.totalAppointments).toBe(4);
    expect(d.cancelledCount).toBe(1);
    expect(d.cancelRate).toBe(0.25);
  });

  it("同意済み(適用)予約と対象外予約のキャンセル率を別々に出す", () => {
    const appts = [
      appt({ id: "1", cancelPolicyApplied: true, status: "cancelled" }),
      appt({ id: "2", cancelPolicyApplied: true, status: "completed" }),
      appt({ id: "3", cancelPolicyApplied: false, status: "cancelled" }),
      appt({ id: "4", cancelPolicyApplied: false, status: "cancelled" }),
    ];
    const d = computeChargeDashboard(appts, []);
    expect(d.policyAppliedCancelRate).toBe(0.5);
    expect(d.policyNotAppliedCancelRate).toBe(1);
  });

  it("no_show:接頭辞のcharge_eventsを予約単位で数える（同一予約の重複は1件）", () => {
    const events = [
      event({ id: "e1", appointmentId: "a1", detail: "no_show: 当日終了時を超過" }),
      event({ id: "e2", appointmentId: "a1", eventType: "retry", detail: "no_show: リトライ" }),
      event({ id: "e3", appointmentId: "a2", detail: "no_show: 当日終了時を超過" }),
      event({ id: "e4", appointmentId: "a3", detail: "通常キャンセル" }),
    ];
    const d = computeChargeDashboard([], events);
    expect(d.noShowCount).toBe(2);
  });

  it("回収額・回収件数はdry_run=falseのchargeイベントのみ集計する", () => {
    const events = [
      event({ id: "e1", amount: 3000, dryRun: false }),
      event({ id: "e2", amount: 5000, dryRun: false }),
      event({ id: "e3", amount: 9999, dryRun: true }), // ドライラン中は集計しない
      event({ id: "e4", amount: 1000, eventType: "failure", dryRun: false }), // 失敗は集計しない
    ];
    const d = computeChargeDashboard([], events);
    expect(d.collectedAmount).toBe(8000);
    expect(d.collectedCount).toBe(2);
  });

  it("課金失敗件数はappointments.chargeStatus='failed'を数える", () => {
    const appts = [appt({ id: "1", chargeStatus: "failed" }), appt({ id: "2", chargeStatus: "charged" }), appt({ id: "3", chargeStatus: "none" })];
    const d = computeChargeDashboard(appts, []);
    expect(d.failedChargeCount).toBe(1);
  });
});
