// 汎用PATCHはトークンのみで任意のstatusに変更できてしまう脆弱性があったため廃止。
// スタッフ操作は認証付きの専用エンドポイント（checkin・complete）へ移行した。
import { describe, it, expect } from "vitest";
import * as route from "./route";

describe("PATCH /api/appointments/[token]", () => {
  it("汎用PATCHは廃止されている（トークンのみでの状態変更を防ぐため）", () => {
    expect((route as Record<string, unknown>).PATCH).toBeUndefined();
  });
});
