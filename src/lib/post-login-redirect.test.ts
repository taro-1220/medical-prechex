// resolvePostLoginPath: ログイン成功後の遷移先を決める純粋関数。
// next優先→無ければ/api/ops/meの結果で/opsか/clinicかを決める。
import { describe, it, expect } from "vitest";
import { resolvePostLoginPath } from "./post-login-redirect";

describe("resolvePostLoginPath", () => {
  it("nextが安全な値なら、それを最優先で使う（isOpsAdminがtrueでも）", () => {
    expect(resolvePostLoginPath("/clinic/settings", { isOpsAdmin: true })).toBe("/clinic/settings");
  });

  it("nextが無く、運営者(isOpsAdmin:true)なら/opsへ", () => {
    expect(resolvePostLoginPath(null, { isOpsAdmin: true })).toBe("/ops");
  });

  it("nextが無く、運営者でなければ/clinicへ", () => {
    expect(resolvePostLoginPath(null, { isOpsAdmin: false })).toBe("/clinic");
  });

  it("nextが無く、/api/ops/meの呼び出しに失敗した場合（null）は/clinicへフォールバック", () => {
    expect(resolvePostLoginPath(null, null)).toBe("/clinic");
  });

  it("nextが安全でない値（//で始まる）なら無視してops判定にフォールバックする", () => {
    expect(resolvePostLoginPath("//evil.com", null)).toBe("/clinic");
    expect(resolvePostLoginPath("//evil.com", { isOpsAdmin: true })).toBe("/ops");
  });
});
