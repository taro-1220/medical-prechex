// 状態値の日本語表示名を1か所にまとめたモジュールを検証する。
// 既知の値は表示名を返し、未知の値はエラーにせず生の値をそのまま返すことを確認する。
import { describe, it, expect } from "vitest";
import {
  getClinicStatusLabel,
  getAppointmentStatusLabel,
  getChargeStatusLabel,
  getStripeAccountStatusLabel,
} from "./status-labels";

describe("getClinicStatusLabel", () => {
  it("既知の値はすべて日本語表示名になる", () => {
    expect(getClinicStatusLabel("active")).toBe("承認済み");
    expect(getClinicStatusLabel("pending_approval")).toBe("承認待ち");
    expect(getClinicStatusLabel("rejected")).toBe("却下");
  });

  it("未知の値はエラーにせず、生の値をそのまま返す", () => {
    expect(getClinicStatusLabel("some_future_status")).toBe("some_future_status");
  });

  it("null/undefinedは「—」を返す", () => {
    expect(getClinicStatusLabel(null)).toBe("—");
    expect(getClinicStatusLabel(undefined)).toBe("—");
  });
});

describe("getAppointmentStatusLabel", () => {
  it("既知の値はすべて日本語表示名になる", () => {
    expect(getAppointmentStatusLabel("confirmation_pending")).toBe("確認待ち");
    expect(getAppointmentStatusLabel("confirmed")).toBe("確認済み");
    expect(getAppointmentStatusLabel("ticket_issued")).toBe("確認済み");
    expect(getAppointmentStatusLabel("checked_in")).toBe("来院済み");
    expect(getAppointmentStatusLabel("completed")).toBe("完了");
    expect(getAppointmentStatusLabel("cancelled")).toBe("キャンセル");
    expect(getAppointmentStatusLabel("expired")).toBe("期限切れ");
  });

  it("未知の値は生の値をそのまま返す", () => {
    expect(getAppointmentStatusLabel("unknown_status")).toBe("unknown_status");
  });
});

describe("getChargeStatusLabel", () => {
  it("既知の値はすべて日本語表示名になる", () => {
    expect(getChargeStatusLabel("none")).toBe("対象外");
    expect(getChargeStatusLabel("charged")).toBe("請求済み");
    expect(getChargeStatusLabel("failed")).toBe("請求失敗");
    expect(getChargeStatusLabel("requires_action")).toBe("要再認証");
    expect(getChargeStatusLabel("written_off")).toBe("請求断念");
  });

  it("未知の値は生の値をそのまま返す", () => {
    expect(getChargeStatusLabel("unknown")).toBe("unknown");
  });
});

describe("getStripeAccountStatusLabel", () => {
  it("既知の値はすべて日本語表示名になる", () => {
    expect(getStripeAccountStatusLabel("not_connected")).toBe("未接続");
    expect(getStripeAccountStatusLabel("pending")).toBe("手続き中");
    expect(getStripeAccountStatusLabel("active")).toBe("有効");
  });

  it("未知の値は生の値をそのまま返す", () => {
    expect(getStripeAccountStatusLabel("unknown")).toBe("unknown");
  });

  it("null/undefinedは「未接続」を返す", () => {
    expect(getStripeAccountStatusLabel(null)).toBe("未接続");
    expect(getStripeAccountStatusLabel(undefined)).toBe("未接続");
  });
});
