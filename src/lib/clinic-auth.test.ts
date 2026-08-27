// 認証リダイレクト（/login ?next=）のオープンリダイレクト対策を検証する。
// isSafeRedirectPathは純粋関数のため、ここではこの関数のみを対象にする。
// /login側の実際の遷移は `router.push(isSafeRedirectPath(next) ? next : "/clinic")` という
// 単純な三項演算のみで構成されており、この関数の真偽値がそのまま遷移先を決定する。
import { describe, it, expect } from "vitest";
import { isSafeRedirectPath } from "./clinic-auth";

describe("isSafeRedirectPath: /loginのnextパラメータ検証（オープンリダイレクト対策）", () => {
  it("同一オリジンの絶対パス（クエリ付き）は安全と判定する", () => {
    expect(isSafeRedirectPath("/clinic/onboarding?stripe=return")).toBe(true);
  });

  it("単純な絶対パスも安全と判定する", () => {
    expect(isSafeRedirectPath("/clinic")).toBe(true);
  });

  it("プロトコル相対URL（//evil.com）は拒否する", () => {
    expect(isSafeRedirectPath("//evil.com")).toBe(false);
  });

  it("バックスラッシュ経由の相対URL（/\\evil.com）は拒否する", () => {
    expect(isSafeRedirectPath("/\\evil.com")).toBe(false);
  });

  it("外部の絶対URL（https://evil.com）は拒否する", () => {
    expect(isSafeRedirectPath("https://evil.com")).toBe(false);
  });

  it("nextが無ければ拒否する（呼び出し側は既定の/clinicへフォールバックする）", () => {
    expect(isSafeRedirectPath(null)).toBe(false);
    expect(isSafeRedirectPath(undefined)).toBe(false);
    expect(isSafeRedirectPath("")).toBe(false);
  });

  it("\"/\"で始まらない相対パスは拒否する", () => {
    expect(isSafeRedirectPath("clinic/onboarding")).toBe(false);
  });
});
