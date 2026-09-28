import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "./supabase-browser";
import type { Clinic, ClinicStatus, StripeAccountStatus } from "./types";

const STRIPE_CONNECT_GENERIC_ERROR = "現在お支払い連携を開始できません。運営事務局までご連絡ください";

export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await getSupabaseBrowser().auth.getUser();
  return user;
}

export async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await getSupabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
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
 */
export function redirectToLogin(router: { replace: (href: string) => void }): void {
  if (typeof window === "undefined") return;
  const next = window.location.pathname + window.location.search;
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
  if (status === "active") return "✓ 有効";
  if (status === "pending") return detailsSubmitted ? "Stripeで確認中" : "未完了";
  return "未接続";
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
export async function requestStripeConnectUrl(
  clinicId: string,
  token: string | null,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: STRIPE_CONNECT_GENERIC_ERROR };
  const res = await fetch("/api/clinic/stripe/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ clinicId }),
  });
  if (!res.ok) return { ok: false, error: STRIPE_CONNECT_GENERIC_ERROR };
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
