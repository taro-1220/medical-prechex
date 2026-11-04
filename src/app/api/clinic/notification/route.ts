import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireClinicAccess } from "@/lib/clinic-access";

export async function PUT(req: NextRequest) {
  const { clinicId, defaultMessage } = await req.json();
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

  const access = await requireClinicAccess(req, clinicId, "settings", { requireActive: true });
  if (!access.ok) return access.response;

  const { error: profErr } = await getSupabase()
    .from("clinic_profile")
    .upsert({ clinic_id: clinicId, default_message: defaultMessage ?? "" }, { onConflict: "clinic_id" });
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  const { error: progErr } = await getSupabase()
    .from("onboarding_progress")
    .upsert({ clinic_id: clinicId, notification_completed: true }, { onConflict: "clinic_id" });
  if (progErr) return NextResponse.json({ error: progErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
