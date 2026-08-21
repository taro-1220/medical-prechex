import { NextRequest, NextResponse } from "next/server";
import { requestCancellation } from "@/lib/store";

// 患者側チケット画面からの［キャンセルを申し出る］。金銭処理は行わず、
// 医院が予約一覧で気付けるよう cancel_requested_at を記録するのみ（連絡手段のみ）
export async function POST(
  _: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const ok = await requestCancellation(token);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
