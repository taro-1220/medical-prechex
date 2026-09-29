// アプリ起動時にStripeキーの環境整合性を検証する。
// 秘密キーはgetStripeClient()の初回呼び出し時に遅延検証されるが、
// 公開可能キー（NEXT_PUBLIC_*）はクライアントバンドルに埋め込まれる性質上、
// 「患者のカード登録画面が開いてから初めて不整合に気づく」事故を避けるため、
// サーバー起動時にここで即座に検知して止める。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateStripePublishableKeyForEnvironment } = await import("@/lib/stripe");
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (publishableKey) {
    validateStripePublishableKeyForEnvironment(publishableKey, process.env.VERCEL_ENV);
  }
}
