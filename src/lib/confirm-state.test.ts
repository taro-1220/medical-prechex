import { describe, it, expect } from "vitest";
import { determineConfirmState, canWrite } from "./confirm-state";

describe("determineConfirmState", () => {
  it("cancelled / expired は常にcancelled", () => {
    expect(determineConfirmState("cancelled", "2026-03-05T01:00:00.000Z", "2026-03-01T00:00:00.000Z")).toBe("cancelled");
    expect(determineConfirmState("expired", "2026-03-05T01:00:00.000Z", "2026-03-01T00:00:00.000Z")).toBe("cancelled");
  });

  it("checked_in / completed は常にpast_closed", () => {
    expect(determineConfirmState("checked_in", "2026-03-05T01:00:00.000Z", "2026-03-01T00:00:00.000Z")).toBe("past_closed");
    expect(determineConfirmState("completed", "2026-03-05T01:00:00.000Z", "2026-03-01T00:00:00.000Z")).toBe("past_closed");
  });

  describe("confirmation_pending", () => {
    it("開始前はupcoming_pending", () => {
      expect(determineConfirmState("confirmation_pending", "2026-03-05T01:00:00.000Z", "2026-03-05T00:59:59.000Z")).toBe("upcoming_pending");
    });
    it("開始時刻ちょうどはpast_pending（境界値）", () => {
      expect(determineConfirmState("confirmation_pending", "2026-03-05T01:00:00.000Z", "2026-03-05T01:00:00.000Z")).toBe("past_pending");
    });
    it("開始後はpast_pending", () => {
      expect(determineConfirmState("confirmation_pending", "2026-03-05T01:00:00.000Z", "2026-03-05T01:00:01.000Z")).toBe("past_pending");
    });
  });

  describe("confirmed / ticket_issued", () => {
    it("開始前はupcoming_consented", () => {
      expect(determineConfirmState("confirmed", "2026-03-05T01:00:00.000Z", "2026-03-05T00:59:59.000Z")).toBe("upcoming_consented");
    });
    it("開始直後・同じJST日ならpast_consented_today", () => {
      expect(determineConfirmState("confirmed", "2026-03-05T01:00:00.000Z", "2026-03-05T01:00:01.000Z")).toBe("past_consented_today");
    });
    it("JST日の終わり際（23:59:59JST）まではpast_consented_today", () => {
      // 2026-03-05T01:00:00Z = JST 10:00。同じJST暦日の23:59:59 = UTC 14:59:59
      expect(determineConfirmState("confirmed", "2026-03-05T01:00:00.000Z", "2026-03-05T14:59:59.000Z")).toBe("past_consented_today");
    });
    it("JST日が変わったらpast_closed（UTC 15:00=JST翌日0:00境界）", () => {
      expect(determineConfirmState("confirmed", "2026-03-05T01:00:00.000Z", "2026-03-05T15:00:00.000Z")).toBe("past_closed");
    });
    it("数日後はpast_closed", () => {
      expect(determineConfirmState("ticket_issued", "2026-03-05T01:00:00.000Z", "2026-03-10T00:00:00.000Z")).toBe("past_closed");
    });
  });
});

describe("canWrite", () => {
  it("upcoming_pendingのみtrue", () => {
    expect(canWrite("upcoming_pending")).toBe(true);
  });
  it("他は全てfalse", () => {
    const others = ["upcoming_consented", "past_pending", "past_consented_today", "past_closed", "cancelled"] as const;
    for (const s of others) expect(canWrite(s)).toBe(false);
  });
});
