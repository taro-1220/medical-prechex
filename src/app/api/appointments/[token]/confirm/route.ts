import { NextRequest, NextResponse } from "next/server";
import { confirmWithConsent } from "@/lib/store";
import { isIdentityVerified } from "@/lib/identity-check";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!isIdentityVerified(req, token)) {
      return NextResponse.json({ error: "identity_verification_required" }, { status: 401 });
    }
    const ok = await confirmWithConsent(token);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
