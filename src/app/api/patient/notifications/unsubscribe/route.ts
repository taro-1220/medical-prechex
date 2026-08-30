import { NextRequest, NextResponse } from "next/server";
import { unsubscribeByToken } from "@/lib/available-slots-store";

// 配信停止導線（メール本文のリンク先）。GETでの誤発火（メールスキャナ等の事前フェッチ）を避けるため
// 実際の状態変更はPOSTのみで行う。GETはページ表示用の確認にのみ使う想定
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : req.nextUrl.searchParams.get("token");
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
    const ok = await unsubscribeByToken(token);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
