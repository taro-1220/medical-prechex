import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireClinicAccess } from "@/lib/clinic-access";
import { isGeneralPolicyStepComplete } from "@/lib/cancel-policy";

export async function PUT(req: NextRequest) {
  const { clinicId, cancellationPolicy } = await req.json();
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

  const access = await requireClinicAccess(req, clinicId, "settings", { requireActive: true });
  if (!access.ok) return access.response;

  const policyText = cancellationPolicy ?? "";

  const { error: profErr } = await getSupabase()
    .from("clinic_profile")
    .upsert({ clinic_id: clinicId, cancellation_policy: policyText }, { onConflict: "clinic_id" });
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  // 完了条件: 本文が空でないこと。ただしキャンセル料ポリシー機能(cancel_policy_enabled)を
  // 使わない医院には本文記入を強制しない（無効時は空でも完了扱い）
  const { data: prof } = await getSupabase()
    .from("clinic_profile")
    .select("cancel_policy_enabled")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  const cancelPolicyEnabled = (prof?.cancel_policy_enabled as boolean | undefined) ?? false;
  const policyCompleted = isGeneralPolicyStepComplete(policyText, cancelPolicyEnabled);

  const { error: progErr } = await getSupabase()
    .from("onboarding_progress")
    .upsert({ clinic_id: clinicId, policy_completed: policyCompleted }, { onConflict: "clinic_id" });
  if (progErr) return NextResponse.json({ error: progErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
