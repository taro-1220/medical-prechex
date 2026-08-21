import { NextRequest, NextResponse } from "next/server";
import { getAppointmentForDisplay, updateStatus } from "@/lib/store";
import { isTicketExpired } from "@/lib/ticket";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const appt = await getAppointmentForDisplay(token);
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 失効判定は参照のたびに行う（statusは書き換えない）。失効後は予約内容・患者名を一切返さない
    if (isTicketExpired(appt.appointmentAt, new Date().toISOString())) {
      return NextResponse.json({ status: "expired" });
    }

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
