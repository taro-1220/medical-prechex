// MVP+2: Stripe連携（Connect Express / SetupIntent / off-session PaymentIntent）。
//
// 絶対制約:
// - オーソリ(manual capture)は使わない。SetupIntent（登録・課金ゼロ）と
//   automatic captureのPaymentIntent（off_session）のみ
// - direct charge: 全てのSetupIntent/PaymentIntentは stripeAccount オプション付きで
//   医院のconnected account上に作成する
// - 課金実行（executeOffSessionCharge）だけがENABLE_CHARGE_EXECUTIONフラグの対象。
//   SetupIntent作成・Connectオンボーディングはフラグに関係なく常に実際にStripeを呼ぶ
//   （課金そのものではないため）
//
// application_fee: Medipre取り分。APPLICATION_FEE_PERCENT（環境変数、未設定時0）を
// 患者請求額(amount)に乗じて算出し、PaymentIntent作成時にapplication_fee_amountとして
// 指定する（direct chargeの仕組み上、amount自体は変わらず、その内訳の一部がMedipre側の
// プラットフォームアカウントへ振り替わるのみ）。旧: 「application_fee_amountは設定しない」
// としていたが、Medipre取り分の記録・徴収を開始するため方針を変更した。

import Stripe from "stripe";
import { computeChargeAmount } from "./charge-policy";

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

/** Medipre取り分の料率（%）。未設定・不正値は0（手数料なし）を返す安全側デフォルト */
export function getApplicationFeePercent(): number {
  const raw = Number(process.env.APPLICATION_FEE_PERCENT);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * 入金スケジュール（settings.payouts.schedule）は本関数で明示指定しない。
 * Stripeの国別デフォルト（JPのExpressアカウントは現状 週次・金曜・4日据え置き）が
 * 適用されたままにしておく方針とし、医院側の希望があればExpressダッシュボード
 * （accounts.stripe.com）から各医院が個別に変更できるようにする。
 * medipre側で一律固定・強制する要件は今のところ無い。
 */
export async function createConnectExpressAccount(email: string): Promise<string> {
  const stripe = getStripeClient();
  const account = await stripe.accounts.create({
    type: "express",
    country: "JP",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
      // card_payments/transfers以外（欧州の決済手段等）はrequestedを明示しないと自動的に
      // activeになる（本人確認不要な決済手段のため）。SetupIntent側はpayment_method_types:
      // ["card"]のみを指定しており患者に提示されることは無いが、意図しない決済手段が
      // Stripe側で有効化された状態を残さないため、明示的にfalseで抑制する
      bancontact_payments: { requested: false },
      eps_payments: { requested: false },
      ideal_payments: { requested: false },
      link_payments: { requested: false },
    },
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

/**
 * Phase P1 セクションF-3: "pending"は「入力途中」と「提出済み・審査待ち」の両方を含むため、
 * details_submittedのみを別途取得して画面表示の出し分けに使う（DBには保存しない、都度Stripeから取得）。
 */
export async function fetchConnectAccountDetailsSubmitted(accountId: string): Promise<boolean> {
  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(accountId);
  return !!account.details_submitted;
}

/**
 * 予約単位のカード登録用SetupIntent。医院のconnected account上に作成する（direct charge）。
 * 検収で発覚した不具合の修正: SetupIntentにCustomerを紐付けないと、後日の別PaymentIntentで
 * 同じPaymentMethodを再利用できない（Stripe側の制約）。DBスキーマは変更せず、Customer IDは
 * PaymentMethod経由（.customer）で都度参照する設計にする（executeOffSessionCharge参照）。
 */
export async function createAppointmentSetupIntent(params: {
  connectedAccountId: string;
  appointmentId: string;
}): Promise<{ setupIntentId: string; clientSecret: string }> {
  const stripe = getStripeClient();
  const customer = await stripe.customers.create(
    { metadata: { appointmentId: params.appointmentId } },
    { stripeAccount: params.connectedAccountId },
  );
  const intent = await stripe.setupIntents.create(
    {
      customer: customer.id,
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

/** SetupIntent成功確認時に、登録されたPaymentMethodをCustomerへ明示的にattachする */
export async function attachPaymentMethodToCustomer(
  connectedAccountId: string,
  paymentMethodId: string,
  customerId: string,
): Promise<void> {
  const stripe = getStripeClient();
  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId }, { stripeAccount: connectedAccountId });
}

export interface OffSessionChargeResult {
  paymentIntentId: string;
  status: Stripe.PaymentIntent.Status;
  requiresAction: boolean;
  /** Medipre取り分（円）。PaymentIntentのレスポンス値をそのまま使う（DB-Stripe間の乖離を避けるため） */
  applicationFeeAmount: number;
}

/**
 * 発生時のみの即時課金。automatic capture・off_session・direct charge。
 * application_fee_amountはgetApplicationFeePercent()に基づき算出し、0円の場合は指定しない。
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

  // 課金対象のPaymentMethodがCustomerに紐付いているかを都度確認する（DBに永続化しない設計のため）。
  // retrieve失敗・customer未紐付けはカードの問題ではないためsystemErrorとし、課金は試行しない
  let customerId: string;
  try {
    const pm = await stripe.paymentMethods.retrieve(params.paymentMethodId, undefined, { stripeAccount: params.connectedAccountId });
    const customer = pm.customer;
    if (!customer) {
      return { systemError: true, errorMessage: "PaymentMethod is not attached to a Customer (customer is null)" };
    }
    customerId = typeof customer === "string" ? customer : customer.id;
  } catch (e) {
    const errorMessage = e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e);
    return { systemError: true, errorMessage: `paymentMethods.retrieve failed: ${errorMessage}` };
  }

  const applicationFeePercent = getApplicationFeePercent();
  const requestedApplicationFeeAmount = computeChargeAmount(params.amountJpy, applicationFeePercent);

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: params.amountJpy,
        currency: "jpy",
        customer: customerId,
        payment_method: params.paymentMethodId,
        off_session: true,
        confirm: true,
        capture_method: "automatic",
        description: params.description,
        metadata: { appointmentId: params.appointmentId },
        ...(requestedApplicationFeeAmount > 0 ? { application_fee_amount: requestedApplicationFeeAmount } : {}),
      },
      { stripeAccount: params.connectedAccountId, idempotencyKey: params.idempotencyKey },
    );
    return {
      paymentIntentId: intent.id,
      status: intent.status,
      requiresAction: intent.status === "requires_action",
      applicationFeeAmount: intent.application_fee_amount ?? 0,
    };
  } catch (e) {
    if (e instanceof Stripe.errors.StripeCardError && e.payment_intent) {
      return {
        paymentIntentId: e.payment_intent.id,
        status: e.payment_intent.status,
        requiresAction: e.payment_intent.status === "requires_action",
        applicationFeeAmount: e.payment_intent.application_fee_amount ?? 0,
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
