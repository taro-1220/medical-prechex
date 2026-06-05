import { NextRequest, NextResponse } from "next/server";
import { getAppointment, updateStatus } from "@/lib/store";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const appt = await getAppointment(token);
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(appt);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { status } = await req.json();
    const extra = status === "checked_in" ? { checkedInAt: new Date().toISOString() } : undefined;
    const ok = await updateStatus(token, status, extra);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
