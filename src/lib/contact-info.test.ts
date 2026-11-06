import { describe, it, expect } from "vitest";
import { isValidEmailFormat, maskEmail } from "./contact-info";

describe("isValidEmailFormat", () => {
  it("正しい形式はtrue", () => {
    expect(isValidEmailFormat("taro@example.com")).toBe(true);
    expect(isValidEmailFormat("  taro@example.com  ")).toBe(true);
  });
  it("@や.が無い、空白を含む等は不正", () => {
    expect(isValidEmailFormat("taro-example.com")).toBe(false);
    expect(isValidEmailFormat("taro@example")).toBe(false);
    expect(isValidEmailFormat("taro @example.com")).toBe(false);
    expect(isValidEmailFormat("")).toBe(false);
  });
});

describe("maskEmail", () => {
  it("先頭1文字以外を伏せる", () => {
    expect(maskEmail("taro@example.com")).toBe("t***@example.com");
  });
  it("1文字のローカル部でも伏せ字を付ける", () => {
    expect(maskEmail("t@example.com")).toBe("t*@example.com");
  });
  it("@が無い場合はそのまま返す", () => {
    expect(maskEmail("not-an-email")).toBe("not-an-email");
  });
});
