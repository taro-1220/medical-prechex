import { NextRequest, NextResponse } from "next/server";
import { updateStatus } from "@/lib/store";

export async function POST(
  _: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const consentAt = new Date().toISOString();
    const ok = await updateStatus(token, "confirmed", { consentAt });
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
