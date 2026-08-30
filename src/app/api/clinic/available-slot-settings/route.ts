import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { setClinicAutoNotifySetting } from "@/lib/available-slots-store";

// 医院設定内「空き枠自動通知」ON/OFF。/api/clinic/notification と同型のパターン
export async function PUT(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clinicId, enabled } = await req.json();
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

  const { data: cu } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!cu) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await setClinicAutoNotifySetting(clinicId, Boolean(enabled));
  return NextResponse.json({ ok: true });
}
