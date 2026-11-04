import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireClinicAccess } from "@/lib/clinic-access";
import { setClinicAutoNotifySetting } from "@/lib/available-slots-store";

// 医院設定内「空き枠自動通知」ON/OFF。/api/clinic/notification と同型のパターン
export async function PUT(req: NextRequest) {
  const { clinicId, enabled } = await req.json();
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

  const access = await requireClinicAccess(req, clinicId, "settings", { requireActive: true });
  if (!access.ok) return access.response;

  await setClinicAutoNotifySetting(clinicId, Boolean(enabled));
  return NextResponse.json({ ok: true });
}
