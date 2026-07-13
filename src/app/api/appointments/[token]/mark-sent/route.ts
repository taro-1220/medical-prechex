import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

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

  const authToken = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!authToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(authToken);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const { data: cu } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("clinic_id", appt.clinic_id)
    .maybeSingle();
  if (!cu) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sentAt = new Date().toISOString();
  const { error: updErr } = await getSupabase()
    .from("appointments")
    .update({ [CHANNEL_COLUMNS[channel]]: sentAt })
    .eq("id", appt.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, sentAt });
}
