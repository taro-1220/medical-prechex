import { describe, it, expect } from "vitest";
import {
  issueIdentityCookieValue,
  verifyIdentityCookieValue,
  normalizeName,
  isNameMatch,
  isPhoneLast4Match,
  COOKIE_MAX_AGE_SEC,
} from "./identity-check";

const SECRET = "test-secret";

describe("issueIdentityCookieValue / verifyIdentityCookieValue", () => {
  it("発行直後は有効", () => {
    const now = Date.UTC(2026, 2, 1);
    const value = issueIdentityCookieValue("tok1", SECRET, now);
    expect(verifyIdentityCookieValue(value, "tok1", SECRET, now)).toBe(true);
  });

  it("24時間後は失効する", () => {
    const now = Date.UTC(2026, 2, 1);
    const value = issueIdentityCookieValue("tok1", SECRET, now);
    const after = now + COOKIE_MAX_AGE_SEC * 1000 + 1000;
    expect(verifyIdentityCookieValue(value, "tok1", SECRET, after)).toBe(false);
  });

  it("23時間59分後はまだ有効", () => {
    const now = Date.UTC(2026, 2, 1);
    const value = issueIdentityCookieValue("tok1", SECRET, now);
    const almostExpired = now + COOKIE_MAX_AGE_SEC * 1000 - 1000;
    expect(verifyIdentityCookieValue(value, "tok1", SECRET, almostExpired)).toBe(true);
  });

  it("別トークン向けの値は無効", () => {
    const now = Date.UTC(2026, 2, 1);
    const value = issueIdentityCookieValue("tok1", SECRET, now);
    expect(verifyIdentityCookieValue(value, "tok2", SECRET, now)).toBe(false);
  });

  it("改ざん（署名部分の変更）は無効", () => {
    const now = Date.UTC(2026, 2, 1);
    const value = issueIdentityCookieValue("tok1", SECRET, now);
    const tampered = value.slice(0, -1) + (value.slice(-1) === "0" ? "1" : "0");
    expect(verifyIdentityCookieValue(tampered, "tok1", SECRET, now)).toBe(false);
  });

  it("形式不正・空文字は無効", () => {
    const now = Date.UTC(2026, 2, 1);
    expect(verifyIdentityCookieValue(undefined, "tok1", SECRET, now)).toBe(false);
    expect(verifyIdentityCookieValue("", "tok1", SECRET, now)).toBe(false);
    expect(verifyIdentityCookieValue("not-a-valid-value", "tok1", SECRET, now)).toBe(false);
  });
});

describe("normalizeName / isNameMatch", () => {
  it("空白（半角・全角）の揺れを無視する", () => {
    expect(isNameMatch("山田 太郎", "山田太郎")).toBe(true);
    expect(isNameMatch("山田　太郎", "山田 太郎")).toBe(true);
  });
  it("全角・半角英数の揺れを無視する", () => {
    expect(isNameMatch("ｔａｒｏ", "taro")).toBe(true);
  });
  it("ひらがな・カタカナの揺れを無視する", () => {
    expect(isNameMatch("やまだたろう", "ヤマダタロウ")).toBe(true);
  });
  it("一致しない場合はfalse", () => {
    expect(isNameMatch("山田太郎", "山田次郎")).toBe(false);
  });
  it("空文字はfalse", () => {
    expect(isNameMatch("", "山田太郎")).toBe(false);
  });
});

describe("isPhoneLast4Match", () => {
  it("末尾4桁が一致すればtrue", () => {
    expect(isPhoneLast4Match("1234", "090-1111-1234")).toBe(true);
  });
  it("一致しなければfalse", () => {
    expect(isPhoneLast4Match("9999", "090-1111-1234")).toBe(false);
  });
  it("4桁以外の入力はfalse", () => {
    expect(isPhoneLast4Match("123", "090-1111-1234")).toBe(false);
    expect(isPhoneLast4Match("12345", "090-1111-1234")).toBe(false);
  });
});
