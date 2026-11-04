import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireClinicAccess } from "@/lib/clinic-access";

export async function POST(req: NextRequest) {
  const { clinicId } = await req.json();
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

  const access = await requireClinicAccess(req, clinicId, "settings", { requireActive: true });
  if (!access.ok) return access.response;

  // 承認制(Phase P1): clinics.status は運営者の承認(/api/ops/clinics/[id]/approve)のみが変更する。
  // requireClinicAccess(requireActive) により未承認・却下の医院は自己有効化できない。

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

  return NextResponse.json({ ok: true });
}
