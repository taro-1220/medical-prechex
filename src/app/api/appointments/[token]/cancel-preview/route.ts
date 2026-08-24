import { NextRequest, NextResponse } from "next/server";
import { getAppointment, getClinicCancelPolicySettings } from "@/lib/store";
import { resolveCancelTier, computeChargeAmount } from "@/lib/charge-policy";

// D-2: 「キャンセルを申し出る」前に、現時点で適用される段階（%と金額）を提示する（読み取りのみ）
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const appt = await getAppointment(token);
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!appt.cancelPolicyApplied || !appt.clinicId || appt.treatmentCategory === "other") {
      return NextResponse.json({ applicable: false });
    }

    const settings = await getClinicCancelPolicySettings(appt.clinicId);
    const policy = settings.policies[appt.treatmentCategory];
    if (!policy) return NextResponse.json({ applicable: false });

    const now = new Date().toISOString();
    const match = resolveCancelTier({
      tiers: policy.tiers,
      appointmentAt: appt.appointmentAt,
      createdAt: appt.createdAt,
      eventAt: now,
      graceHours: policy.graceHours,
      isNoShow: false,
    });
    const amount = appt.baseAmount != null ? computeChargeAmount(appt.baseAmount, match.percent) : null;

    return NextResponse.json({
      applicable: true,
      reason: match.reason,
      percent: match.percent,
      amount,
      hasPaymentMethod: !!appt.stripePaymentMethodId,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
