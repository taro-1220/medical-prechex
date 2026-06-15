import { NextRequest, NextResponse } from "next/server";
import { getAppointment, updateStatus } from "@/lib/store";

export async function POST(
  _: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const appt = await getAppointment(token);
    if (!appt) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (appt.status === "checked_in") {
      return NextResponse.json({ ok: true, alreadyCheckedIn: true });
    }
    if (appt.status !== "confirmed") {
      return NextResponse.json({ error: "invalid_status", current: appt.status }, { status: 409 });
    }
    const ok = await updateStatus(token, "checked_in", { checkedInAt: new Date().toISOString() });
    if (!ok) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
