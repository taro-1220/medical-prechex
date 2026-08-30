import { NextRequest, NextResponse } from "next/server";
import {
  getPatientNotifyPreferenceByAppointmentToken,
  setPatientNotifyPreferenceByAppointmentToken,
} from "@/lib/available-slots-store";

// 患者自身の予約チケット画面から「空き枠のお知らせを受け取る」をON/OFFする。
// 既存のcancel-request等と同じ認可モデル: appointments.token（患者本人にのみ知りうる不透明な値）を鍵にする
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const enabled = await getPatientNotifyPreferenceByAppointmentToken(token);
    if (enabled === null) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ enabled });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await req.json().catch(() => ({}));
    const enabled = Boolean(body?.enabled);
    const ok = await setPatientNotifyPreferenceByAppointmentToken(token, enabled);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, enabled });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
