import { NextRequest, NextResponse } from "next/server";

// サイト全体の一時パスワードゲート。既存のクリニックログイン/患者認証とは無関係。
// SITE_ACCESS_PASSWORD が未設定なら即時無効化（本番公開時はEnv Varを削除するだけで解除できる）。
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

const COOKIE_NAME = "mp_gate";
const BYPASS_PATHS = ["/site-gate", "/api/site-gate", "/api/cron"];

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
