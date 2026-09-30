import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "./supabase-browser";
import type { Clinic, ClinicStatus, StripeAccountStatus } from "./types";
import { getStripeAccountStatusLabel } from "./status-labels";

const STRIPE_CONNECT_GENERIC_ERROR = "現在お支払い連携を開始できません。運営事務局までご連絡ください";

/**
 * セクションC: 問い合わせ先。F-4の失敗案内文・事前準備モーダルの補足の両方が参照する。
 * 空にすれば両方とも連絡先の行を出さない。
 */
export const SUPPORT_CONTACT_TEXT = "support@medipre.jp";

/** 空文字ならnull（連絡先の行を出さない）。値があれば「お困りの場合：（連絡先）」を返す。 */
export function formatSupportContactLine(contactText: string): string | null {
  return contactText ? `お困りの場合：${contactText}` : null;
}

export function getSupportContactLine(): string | null {
  return formatSupportContactLine(SUPPORT_CONTACT_TEXT);
}

/**
 * セクションF-B6: 手数料の説明に使う「表示専用」の料率。実際の入金額を決めるapplication_fee計算
 * （getApplicationFeePercent, src/lib/stripe.ts）とは無関係で、運用環境変数(APPLICATION_FEE_PERCENT)
 * を書き換えても自動反映されない。料率が変わった場合はここだけ直せばよいよう1か所にまとめる。
 */
export const STRIPE_FEE_RATE_DISPLAY = 0.036;
export const MEDIPRE_FEE_RATE_DISPLAY = 0.05;

/** 手数料説明の例で使う回収額（表示専用）。 */
export const FEE_EXAMPLE_AMOUNT = 1000;

/** 上記の表示専用料率から、案内文中の受取額の例を計算する。 */
export function calculateFeeExampleReceivedAmount(amount: number): number {
  return Math.round(amount * (1 - STRIPE_FEE_RATE_DISPLAY - MEDIPRE_FEE_RATE_DISPLAY));
}

export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await getSupabaseBrowser().auth.getUser();
  return user;
}

export async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await getSupabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

/**
 * ログアウト。確認ダイアログは出さず、押されたら即座に実行する
 * （誤って押しても再ログインすれば戻れるため）。セッションを確実に消してから/loginへ遷移する。
 */
export async function signOut(): Promise<void> {
  await getSupabaseBrowser().auth.signOut();
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

export async function getUserClinics(): Promise<Clinic[]> {
  const token = await getAccessToken();
  if (!token) return [];
  const res = await fetch("/api/clinic/list", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function getCurrentClinic(): Promise<Clinic | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const res = await fetch("/api/clinic/current", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * "/login"へのリダイレクト先として安全なパスか（オープンリダイレクト対策）。
 * "/"で始まり、"//"（プロトコル相対URL）にも"/\\"（バックスラッシュ経由の相対URL）にもならないこと。
 */
export function isSafeRedirectPath(path: string | null | undefined): path is string {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.startsWith("/\\")) return false;
  return true;
}

/**
 * 未認証時に"/login"へ退避する共通ヘルパー。現在のパス＋クエリをnextとして付与し、
 * ログイン後に元の画面（例: Stripeオンボーディングからの戻り`?stripe=return`）へ戻れるようにする。
 * 現在地がすでに/login（またはそのサブパス）なら何もしない。React Strict Modeの
 * 二重effect実行などで複数の画面ガードがほぼ同時にこれを呼んだ場合でも、
 * 先の呼び出しで/loginへ遷移済みなら後続の呼び出しはnextの入れ子を作らず素通りする。
 */
export function redirectToLogin(router: { replace: (href: string) => void }): void {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname === "/login" || pathname.startsWith("/login/")) return;
  const next = pathname + search;
  router.replace(`/login?next=${encodeURIComponent(next)}`);
}

/**
 * Phase P1: 承認制の医院がまだ利用開始できない場合、退避すべきパスを返す（純粋関数）。
 * 'active'ならnull（そのまま進んでよい）。/clinic・/clinic/onboarding双方の入口で共通利用する。
 */
export function getClinicApprovalRedirect(status: ClinicStatus): string | null {
  if (status === "active") return null;
  return "/clinic/pending-approval";
}

/**
 * Phase P1 セクションF-1: 「Stripeに接続する」押下時、事前準備モーダルを挟むべきか。
 * 初回接続（not_connected/未取得）のときだけガイドが必要。再開(pending)・管理(active)は
 * 既存のconnectStripe()を直接呼ぶ。
 */
export function shouldShowStripePreCheck(status: StripeAccountStatus | null | undefined): boolean {
  return !status || status === "not_connected";
}

/** セクションF-3: Stripe欄の表示文言。pendingは提出済み(detailsSubmitted)かどうかで出し分ける。 */
export function getStripeStatusLabel(
  status: StripeAccountStatus | null | undefined,
  detailsSubmitted: boolean | null | undefined,
): string {
  if (status === "active") return `✓ ${getStripeAccountStatusLabel("active")}`;
  if (status === "pending") return detailsSubmitted ? "Stripeで確認中" : "未完了";
  return getStripeAccountStatusLabel(status);
}

/** セクションF-2: 再開バナーはpendingのときだけ表示する。 */
export function isStripePendingBannerVisible(status: StripeAccountStatus | null | undefined): boolean {
  return status === "pending";
}

/**
 * /clinic（ダッシュボード）専用: Stripe連携はキャンセル料回収時にのみ必要な設定のため、
 * 初期設定（activate）が完了するまではStripeバナーを出さず、初期設定バナーのみ見せる。
 * /clinic/onboardingではこの制約を適用しない（そちらは元々Stripeバナーの表示のみ）。
 */
export function isStripePendingBannerVisibleOnDashboard(
  activatedAt: string | null | undefined,
  status: StripeAccountStatus | null | undefined,
): boolean {
  return !!activatedAt && isStripePendingBannerVisible(status);
}

/**
 * セクションF-2/F-4: Stripe Connectのオンボーディングリンクを要求する。
 * 失敗時（token無し・API失敗いずれも）は内部エラー文をそのまま出さず、
 * 案内事務局への問い合わせを促す日本語文言に統一する。
 */
function buildStripeConnectErrorMessage(): string {
  const contactLine = getSupportContactLine();
  return contactLine ? `${STRIPE_CONNECT_GENERIC_ERROR}\n${contactLine}` : STRIPE_CONNECT_GENERIC_ERROR;
}

export async function requestStripeConnectUrl(
  clinicId: string,
  token: string | null,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: buildStripeConnectErrorMessage() };
  const res = await fetch("/api/clinic/stripe/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ clinicId }),
  });
  if (!res.ok) return { ok: false, error: buildStripeConnectErrorMessage() };
  const { url } = await res.json();
  return { ok: true, url };
}

/** セクションF-2: クリック即ブラウザ遷移まで行う薄いラッパー（ダッシュボード・初期設定画面で共用）。 */
export async function startStripeConnect(clinicId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await getAccessToken();
  const result = await requestStripeConnectUrl(clinicId, token);
  if (!result.ok) return result;
  if (typeof window !== "undefined") window.location.href = result.url;
  return { ok: true };
}
