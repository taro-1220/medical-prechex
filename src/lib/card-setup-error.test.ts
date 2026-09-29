// getCardSetupErrorMessage: Stripeのconfirm系エラーのうち、カード拒否など
// 患者側で対処できるcard_errorはそのまま見せ、それ以外（鍵の環境不一致など
// システム側の問題）は日本語の汎用案内に置き換えることを検証する。
import { describe, it, expect } from "vitest";
import { getCardSetupErrorMessage } from "./card-setup-error";

describe("getCardSetupErrorMessage", () => {
  it("card_error（カード拒否等）はStripeのメッセージをそのまま返す", () => {
    const message = getCardSetupErrorMessage({ type: "card_error", message: "Your card was declined." });
    expect(message).toBe("Your card was declined.");
  });

  it("card_errorでmessageが無い場合は汎用文言にフォールバックする", () => {
    const message = getCardSetupErrorMessage({ type: "card_error", message: undefined });
    expect(message).toContain("カードの登録に失敗しました");
  });

  it("invalid_request_error（鍵の環境不一致等）は生のメッセージを見せず、日本語の汎用案内＋問い合わせ先にする", () => {
    const message = getCardSetupErrorMessage({
      type: "invalid_request_error",
      message: "No such setupintent: 'seti_xxx'; a similar object exists in test mode, but a live mode key was used to make this request.",
    });
    expect(message).not.toContain("setupintent");
    expect(message).not.toContain("live mode key");
    expect(message).toContain("カードの登録に失敗しました");
    expect(message).toContain("お困りの場合：support@medipre.jp");
  });

  it("api_error等その他のtypeも同様に汎用案内にする", () => {
    const message = getCardSetupErrorMessage({ type: "api_error", message: "Internal server error" });
    expect(message).not.toContain("Internal server error");
    expect(message).toContain("カードの登録に失敗しました");
  });

  it("stripeErrorがnull/undefinedでも汎用案内を返す", () => {
    expect(getCardSetupErrorMessage(null)).toContain("カードの登録に失敗しました");
    expect(getCardSetupErrorMessage(undefined)).toContain("カードの登録に失敗しました");
  });
});
