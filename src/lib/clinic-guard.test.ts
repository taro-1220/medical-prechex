// resolveClinicGuard: /clinic配下の各画面で共通の入室判定。
// 「未ログイン」と「認証済みだがクリニック未割当」を区別する
// （旧実装はgetCurrentClinic()のnullだけで判定していたため、後者を前者と誤判定し、
//  クリニック未割当の認証済みユーザーを/loginへ送り返すループになっていた）。
import { describe, it, expect } from "vitest";
import { resolveClinicGuard, shouldRenderClinicContent } from "./clinic-guard";
import type { Clinic } from "./types";

const CLINIC: Clinic = {
  id: "clinic-1",
  name: "テスト歯科クリニック",
  slug: "test",
  phone: null,
  email: null,
  address: null,
  status: "active",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("resolveClinicGuard", () => {
  it("アクセストークンが無ければ'login'（未ログイン・セッション切れ）", () => {
    expect(resolveClinicGuard(null, null)).toBe("login");
  });

  it("トークンが無ければ、クリニックの有無に関わらず'login'", () => {
    expect(resolveClinicGuard(null, CLINIC)).toBe("login");
  });

  it("トークンはあるがクリニックが無ければ'no-clinic'（認証済みでクリニック未割当）", () => {
    expect(resolveClinicGuard("token", null)).toBe("no-clinic");
  });

  it("トークンがありクリニックもあれば'ok'", () => {
    expect(resolveClinicGuard("token", CLINIC)).toBe("ok");
  });
});

describe("shouldRenderClinicContent: 画面の中身を描画してよいかの判定", () => {
  it("'ok'のときだけ描画してよい", () => {
    expect(shouldRenderClinicContent("ok")).toBe(true);
  });

  it("判定前（'checking'）は描画しない", () => {
    expect(shouldRenderClinicContent("checking")).toBe(false);
  });

  it("'login'（/loginへ遷移中）は描画しない", () => {
    expect(shouldRenderClinicContent("login")).toBe(false);
  });

  it("'no-clinic'（/clinicへ遷移中）は描画しない", () => {
    expect(shouldRenderClinicContent("no-clinic")).toBe(false);
  });
});
