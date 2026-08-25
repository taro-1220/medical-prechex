import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "mp_gate";

async function expectedCookieValue(password: string, secret: string) {
  const data = new TextEncoder().encode(`${password}:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeNext(next: string): string {
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("://")) return "/";
  return next;
}

export async function POST(req: NextRequest) {
  const password = process.env.SITE_ACCESS_PASSWORD;
  const form = await req.formData();
  const input = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? "/"));

  if (!password || input !== password) {
    const url = req.nextUrl.clone();
    url.pathname = "/site-gate";
    url.search = "";
    url.searchParams.set("next", next);
    url.searchParams.set("error", "1");
    return NextResponse.redirect(url, { status: 303 });
  }

  const secret = process.env.SITE_ACCESS_COOKIE_SECRET ?? "";
  const value = await expectedCookieValue(password, secret);

  const res = NextResponse.redirect(new URL(next, req.nextUrl.origin), { status: 303 });
  res.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
