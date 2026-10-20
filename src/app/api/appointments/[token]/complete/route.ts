import { NextRequest, NextResponse } from "next/server";
import { getAppointment, updateStatus } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";

// スタッフ専用。診察完了は来院済み（checked_in）の予約に対してのみクリニック所属スタッフが行える
// （来院前の予約を直接completedにして来院確認・キャンセル料判定を迂回できないようにする）
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const authToken = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!authToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(authToken);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { token } = await params;
    const appt = await getAppointment(token);
    if (!appt) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (!appt.clinicId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { data: cu } = await getSupabase()
      .from("clinic_users")
      .select("clinic_id")
      .eq("user_id", user.id)
      .eq("clinic_id", appt.clinicId)
      .maybeSingle();
    if (!cu) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (appt.status === "completed") {
      return NextResponse.json({ ok: true, alreadyCompleted: true });
    }
    if (appt.status !== "checked_in") {
      return NextResponse.json({ error: "invalid_status", current: appt.status }, { status: 409 });
    }
    const ok = await updateStatus(token, "completed");
    if (!ok) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
