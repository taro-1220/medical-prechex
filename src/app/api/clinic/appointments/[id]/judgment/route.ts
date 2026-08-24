import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAppointmentById, getClinicCancelPolicySettings } from "@/lib/store";
import { resolveCancelTier, computeChargeAmount, evaluateChargeEligibility } from "@/lib/charge-policy";
import { isWithinGraceHours } from "@/lib/cancel-policy";
import { isChargeExecutionEnabled } from "@/lib/stripe";

// C-4: 判定パネル。機械判定できる事実のみを返す。金額の提案（推奨額）は一切含めない
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const appt = await getAppointmentById(id);
    if (!appt || !appt.clinicId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: cu } = await getSupabase()
      .from("clinic_users")
      .select("clinic_id")
      .eq("user_id", user.id)
      .eq("clinic_id", appt.clinicId)
      .maybeSingle();
    if (!cu) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!appt.cancelPolicyApplied) {
      return NextResponse.json({
        applicable: false,
        consented: !!appt.cancelPolicyAgreedAt,
        note: "同意なし・対象外のため請求根拠なし",
      });
    }

    const settings = await getClinicCancelPolicySettings(appt.clinicId);
    const policy = appt.treatmentCategory !== "other" ? settings.policies[appt.treatmentCategory] : null;
    const graceHours = policy?.graceHours ?? 24;
    const now = new Date().toISOString();

    const withinGrace = isWithinGraceHours(appt.createdAt, now, graceHours);
    const tierMatch = resolveCancelTier({
      tiers: policy?.tiers ?? null,
      appointmentAt: appt.appointmentAt,
      createdAt: appt.createdAt,
      eventAt: now,
      graceHours,
      isNoShow: false,
    });
    const amount = appt.baseAmount != null ? computeChargeAmount(appt.baseAmount, tierMatch.percent) : null;
    const eligibility = evaluateChargeEligibility({
      cancelPolicyApplied: appt.cancelPolicyApplied,
      cancelPolicyAgreedAt: appt.cancelPolicyAgreedAt ?? null,
      withinGraceHours: withinGrace,
      hasPaymentMethod: !!appt.stripePaymentMethodId,
      chargeExecutionEnabled: isChargeExecutionEnabled(),
    });

    return NextResponse.json({
      applicable: true,
      consented: !!appt.cancelPolicyAgreedAt,
      consentedAt: appt.cancelPolicyAgreedAt ?? null,
      policySnapshot: appt.cancelPolicySnapshot ?? null,
      withinGraceHours: withinGrace,
      graceHours,
      tierMatch,
      baseAmount: appt.baseAmount,
      amount,
      hasPaymentMethod: !!appt.stripePaymentMethodId,
      eligibility,
      chargeExecutionEnabled: isChargeExecutionEnabled(),
      currentChargeStatus: appt.chargeStatus,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
