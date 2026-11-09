import { NextRequest, NextResponse } from "next/server";
import { confirmWithConsent, getAppointment } from "@/lib/store";
import { isIdentityVerified } from "@/lib/identity-check";
import { determineConfirmState, canWrite } from "@/lib/confirm-state";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!isIdentityVerified(req, token)) {
      return NextResponse.json({ error: "identity_verification_required" }, { status: 401 });
    }
    const appt = await getAppointment(token);
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const state = determineConfirmState(appt.status, appt.appointmentAt, new Date().toISOString());
    if (!canWrite(state)) {
      return NextResponse.json({ error: "invalid_state" }, { status: 409 });
    }
    const ok = await confirmWithConsent(token);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
