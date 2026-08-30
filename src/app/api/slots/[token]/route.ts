import { NextRequest, NextResponse } from "next/server";
import { getSlotByNotificationToken } from "@/lib/available-slots-store";

// 通知メール内の予約URLを開いた時点で、医院・日付・時間が分かる状態にする（PIIは一切含めない）
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const found = await getSlotByNotificationToken(token);
    if (!found) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({
      clinicName: found.clinicName,
      appointmentAt: found.slot.appointmentAt,
      status: found.slot.status,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
