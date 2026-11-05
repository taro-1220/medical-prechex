import { describe, it, expect } from "vitest";
import { activeFromQuery } from "./stats-cards-active";

describe("activeFromQuery: URLクエリ(range/status)からカードのactiveを導く", () => {
  it("range=today かつ statusなしは today", () => {
    expect(activeFromQuery("today", null)).toBe("today");
  });

  it("statusがあれば、その値を優先する", () => {
    expect(activeFromQuery("all", "pending")).toBe("pending");
    expect(activeFromQuery("all", "confirmed")).toBe("confirmed");
    expect(activeFromQuery("all", "visited")).toBe("visited");
    expect(activeFromQuery("all", "canceled")).toBe("canceled");
  });

  it("range=today かつ status指定がある場合はstatusを優先する(todayにしない)", () => {
    expect(activeFromQuery("today", "pending")).toBe("pending");
  });

  it("不正なstatus値は無視してnullまたはtoday判定にフォールバックする", () => {
    expect(activeFromQuery("all", "invalid")).toBe(null);
    expect(activeFromQuery("today", "invalid")).toBe("today");
  });

  it("rangeのみ（today以外）・statusなしはnull", () => {
    expect(activeFromQuery("upcoming", null)).toBe(null);
    expect(activeFromQuery("past", null)).toBe(null);
    expect(activeFromQuery("all", null)).toBe(null);
  });

  it("range・statusともに無し(null)はnull", () => {
    expect(activeFromQuery(null, null)).toBe(null);
  });
});
