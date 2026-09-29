import { getSupportContactLine } from "./clinic-auth";

const GENERIC_CARD_REGISTRATION_ERROR =
  "カードの登録に失敗しました。時間をおいて再度お試しください。解決しない場合はお問い合わせください";

/**
 * type==="card_error"（カード拒否・期限切れ・番号不備など、患者側で対処できる
 * 内容）はStripeのメッセージをそのまま表示する。それ以外（invalid_request_error等、
 * 鍵の環境不一致のような設定不備・システム側の問題）は、内部的な英語エラーを
 * そのまま見せず、日本語の汎用案内（＋問い合わせ先があれば併記）に置き換える。
 */
export function getCardSetupErrorMessage(stripeError: { type?: string; message?: string } | null | undefined): string {
  if (stripeError?.type === "card_error") {
    return stripeError.message ?? GENERIC_CARD_REGISTRATION_ERROR;
  }
  const contactLine = getSupportContactLine();
  return contactLine ? `${GENERIC_CARD_REGISTRATION_ERROR}\n${contactLine}` : GENERIC_CARD_REGISTRATION_ERROR;
}
