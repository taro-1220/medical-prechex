import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clinicId } = await req.json();
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

  const { data: cu } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!cu) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: prog } = await getSupabase()
    .from("onboarding_progress")
    .select("profile_completed, policy_completed, notification_completed")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (!prog?.profile_completed || !prog?.policy_completed || !prog?.notification_completed) {
    return NextResponse.json({ error: "初期設定が完了していません" }, { status: 400 });
  }

  const { error: progErr } = await getSupabase()
    .from("onboarding_progress")
    .update({ activated_at: new Date().toISOString() })
    .eq("clinic_id", clinicId);
  if (progErr) return NextResponse.json({ error: progErr.message }, { status: 500 });

  const { error: clinicErr } = await getSupabase()
    .from("clinics")
    .update({ status: "active" })
    .eq("id", clinicId);
  if (clinicErr) return NextResponse.json({ error: clinicErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
