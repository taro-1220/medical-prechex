import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "./supabase-browser";
import type { Clinic, ClinicStatus } from "./types";

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
