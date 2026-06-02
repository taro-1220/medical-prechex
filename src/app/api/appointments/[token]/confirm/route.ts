import { NextRequest, NextResponse } from "next/server";
import { updateStatus } from "@/lib/store";

export async function POST(
  _: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const consentAt = new Date().toISOString();
  if (!updateStatus(token, "confirmed", { consentAt })) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
