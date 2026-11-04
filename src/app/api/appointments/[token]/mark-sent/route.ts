import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authenticateRequest, authorizeClinicAccess } from "@/lib/clinic-access";

const CHANNEL_COLUMNS = {
  line: "line_sent_at",
  sms: "sms_sent_at",
  email: "email_sent_at",
} as const;

type Channel = keyof typeof CHANNEL_COLUMNS;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const channel = body?.channel as Channel | undefined;
  if (channel !== "line" && channel !== "sms" && channel !== "email") {
    return NextResponse.json({ error: "invalid_channel" }, { status: 400 });
  }

  const { data: appt, error: apptErr } = await getSupabase()
    .from("appointments")
    .select("id, clinic_id")
    .eq("token", token)
    .maybeSingle();
  if (apptErr) return NextResponse.json({ error: apptErr.message }, { status: 500 });
  if (!appt) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // service role での無条件更新はしない: 予約の clinic に所属するユーザーのみ許可
  if (!appt.clinic_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // 通知送信の記録は予約業務(reservation)。承認済み(active)の医院のみ
  const access = await authorizeClinicAccess(user, appt.clinic_id, "reservation", { requireActive: true });
  if (!access.ok) return access.response;

  const sentAt = new Date().toISOString();
  const { error: updErr } = await getSupabase()
    .from("appointments")
    .update({ [CHANNEL_COLUMNS[channel]]: sentAt })
    .eq("id", appt.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, sentAt });
}
