import { NextRequest, NextResponse } from "next/server";

// サイト全体の一時パスワードゲート。既存のクリニックログイン/患者認証とは無関係。
// SITE_ACCESS_PASSWORD が未設定なら即時無効化（本番公開時はEnv Varを削除するだけで解除できる）。
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

const COOKIE_NAME = "mp_gate";
// MVP+2/+3: 患者向けの正規リンク（予約確認・空き枠通知・配信停止）はsite-gate対象外にする。
// /api/appointments はスタッフ用の一覧取得/新規作成(token無し)も含むが、各ルート自身の
// Supabase Bearer認証で保護されているため、site-gate層を外しても実質的な保護は失われない。
// Phase P1: 医院セルフサインアップ・承認済み医院のログイン後導線をsite-gate対象外にする。
// /clinic・/api/clinic はSupabase Auth（各ルート自身のBearer認証）で保護されているため、
// site-gate層を外しても実質的な保護は失われない（/api/appointments等と同じ考え方）。
// /login も合わせて対象外にしないと、セッション切れ等で再ログインが必要な場面で
// site-gateの壁に阻まれるため追加する（/login自体は入力フォームでデータを返さない）。
// /opsは意図的に対象外にしない（site-gate + OPS_ADMIN_EMAILSの二重保護を維持する）。
const BYPASS_PATHS = [
  "/site-gate", "/api/site-gate", "/api/cron",
  "/slots", "/api/slots",
  "/confirm", "/api/appointments", "/terms",
  "/patient/notifications/unsubscribe", "/api/patient/notifications/unsubscribe",
  "/signup", "/api/clinic/signup",
  "/clinic", "/api/clinic", "/login",
  "/reports",
];

async function expectedCookieValue(password: string, secret: string) {
  const data = new TextEncoder().encode(`${password}:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const password = process.env.SITE_ACCESS_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (BYPASS_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const secret = process.env.SITE_ACCESS_COOKIE_SECRET ?? "";
  const expected = await expectedCookieValue(password, secret);
  if (req.cookies.get(COOKIE_NAME)?.value === expected) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Site is password protected" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/site-gate";
  url.search = "";
  url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}
