// MVP+2: Stripe連携（Connect Express / SetupIntent / off-session PaymentIntent）。
//
// 絶対制約:
// - オーソリ(manual capture)は使わない。SetupIntent（登録・課金ゼロ）と
//   automatic captureのPaymentIntent（off_session）のみ
// - direct charge: 全てのSetupIntent/PaymentIntentは stripeAccount オプション付きで
//   医院のconnected account上に作成する。application_fee_amountは設定しない
// - 課金実行（executeOffSessionCharge）だけがENABLE_CHARGE_EXECUTIONフラグの対象。
//   SetupIntent作成・Connectオンボーディングはフラグに関係なく常に実際にStripeを呼ぶ
//   （課金そのものではないため）

import Stripe from "stripe";

let _client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!key.startsWith("sk_test_")) {
    // 絶対制約3: Stripeはテストモードのみ
    throw new Error("STRIPE_SECRET_KEY is not a test key (sk_test_...). 本番キーはこのフェーズでは使用しない");
  }
  _client = new Stripe(key, { apiVersion: "2026-07-29.dahlia" });
  return _client;
}

/** 課金実行フラグ。false（既定）の間は課金APIを一切呼ばずドライランする */
export function isChargeExecutionEnabled(): boolean {
  return process.env.ENABLE_CHARGE_EXECUTION === "true";
}

export async function createConnectExpressAccount(email: string): Promise<string> {
  const stripe = getStripeClient();
  const account = await stripe.accounts.create({
    type: "express",
    country: "JP",
    email,
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
  });
  return account.id;
}

export async function createAccountOnboardingLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string,
): Promise<string> {
  const stripe = getStripeClient();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

export type ConnectAccountStatus = "not_connected" | "pending" | "active";

export async function fetchConnectAccountStatus(accountId: string): Promise<ConnectAccountStatus> {
  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(accountId);
  if (account.charges_enabled && account.details_submitted) return "active";
  return "pending";
}

/** 予約単位のカード登録用SetupIntent。医院のconnected account上に作成する（direct charge） */
export async function createAppointmentSetupIntent(params: {
  connectedAccountId: string;
  appointmentId: string;
}): Promise<{ setupIntentId: string; clientSecret: string }> {
  const stripe = getStripeClient();
  const intent = await stripe.setupIntents.create(
    {
      usage: "off_session",
      payment_method_types: ["card"],
      payment_method_options: { card: { request_three_d_secure: "automatic" } },
      metadata: { appointmentId: params.appointmentId },
    },
    { stripeAccount: params.connectedAccountId },
  );
  if (!intent.client_secret) throw new Error("SetupIntent client_secret missing");
  return { setupIntentId: intent.id, clientSecret: intent.client_secret };
}

export async function retrieveSetupIntent(connectedAccountId: string, setupIntentId: string) {
  const stripe = getStripeClient();
  return stripe.setupIntents.retrieve(setupIntentId, undefined, { stripeAccount: connectedAccountId });
}

export interface OffSessionChargeResult {
  paymentIntentId: string;
  status: Stripe.PaymentIntent.Status;
  requiresAction: boolean;
}

/**
 * 発生時のみの即時課金。automatic capture・off_session・direct charge（application_fee無し）。
 * 呼び出し側が isChargeExecutionEnabled() を確認してから呼ぶ（ここでは判定しない＝二重ガード回避）。
 */
/** Phase K: カード拒否以外の全例外（ネットワーク障害・レート制限・idempotency_error・Connect不備等）。
 * PaymentIntentが作れていない＝カードの問題ではないため、呼び出し側はcharge_eventsに
 * failure_kind='system_error'として記録し、患者には「別カードで」ではなく医院連絡を案内する。 */
export interface OffSessionChargeSystemError {
  systemError: true;
  /** カード番号等の機微情報は含まない（Stripeエラーオブジェクトのmessage/typeのみを使う） */
  errorMessage: string;
}

export async function executeOffSessionCharge(params: {
  connectedAccountId: string;
  paymentMethodId: string;
  amountJpy: number;
  appointmentId: string;
  description: string;
  /** Phase K: 同一カードでの重複実行は同じキーになり、カード変更後の再試行は新規キーになるようにする
   * （`${appointmentId}:${eventType}:${paymentMethodId}`形式。E-3の`${appointmentId}:retry`は対象外） */
  idempotencyKey: string;
}): Promise<OffSessionChargeResult | OffSessionChargeSystemError> {
  const stripe = getStripeClient();
  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: params.amountJpy,
        currency: "jpy",
        payment_method: params.paymentMethodId,
        off_session: true,
        confirm: true,
        capture_method: "automatic",
        description: params.description,
        metadata: { appointmentId: params.appointmentId },
      },
      { stripeAccount: params.connectedAccountId, idempotencyKey: params.idempotencyKey },
    );
    return {
      paymentIntentId: intent.id,
      status: intent.status,
      requiresAction: intent.status === "requires_action",
    };
  } catch (e) {
    if (e instanceof Stripe.errors.StripeCardError && e.payment_intent) {
      return {
        paymentIntentId: e.payment_intent.id,
        status: e.payment_intent.status,
        requiresAction: e.payment_intent.status === "requires_action",
      };
    }
    // Stripeのエラーオブジェクトはカード番号等の機微情報を含まない旨をSDKが保証する
    // （raw PANはStripe側で保持されずトークン化されるため、message/typeに混入し得ない）
    const errorMessage = e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e);
    return { systemError: true, errorMessage };
  }
}

/** requires_action時、チケット画面から確認する用のclient_secretを取得する */
export async function retrievePaymentIntent(connectedAccountId: string, paymentIntentId: string) {
  const stripe = getStripeClient();
  return stripe.paymentIntents.retrieve(paymentIntentId, undefined, { stripeAccount: connectedAccountId });
}
