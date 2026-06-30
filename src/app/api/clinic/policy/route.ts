import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function PUT(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clinicId, cancellationPolicy } = await req.json();
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

  const { data: cu } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!cu) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error: profErr } = await getSupabase()
    .from("clinic_profile")
    .upsert({ clinic_id: clinicId, cancellation_policy: cancellationPolicy ?? "" }, { onConflict: "clinic_id" });
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  const { error: progErr } = await getSupabase()
    .from("onboarding_progress")
    .upsert({ clinic_id: clinicId, policy_completed: true }, { onConflict: "clinic_id" });
  if (progErr) return NextResponse.json({ error: progErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
