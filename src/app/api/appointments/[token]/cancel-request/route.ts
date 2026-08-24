import { NextRequest, NextResponse } from "next/server";
import { getAppointment, getClinicCancelPolicySettings, requestCancellation, updateStatus } from "@/lib/store";
import { getClinicStripeAccount } from "@/lib/charge-store";
import { attemptCancelCharge } from "@/lib/charge-execution";

// 患者側チケット画面からの［キャンセルを申し出る］。
// MVP+1: 医院への連絡手段として cancel_requested_at を記録。
// MVP+2: 予約を確定的にキャンセルし（E-1の患者起点）、キャンセルポリシー適用時は
// 段階判定→成立条件確認→（フラグON時のみ）Stripe課金、を実行する。
export async function POST(
  _: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const appt = await getAppointment(token);
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const requested = await requestCancellation(token);
    if (!requested) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = new Date().toISOString();
    await updateStatus(token, "cancelled", { cancelledAt: now });

    let chargeResult = null;
    if (appt.cancelPolicyApplied && appt.clinicId && appt.treatmentCategory !== "other") {
      const settings = await getClinicCancelPolicySettings(appt.clinicId);
      const policy = settings.policies[appt.treatmentCategory];
      const { stripeAccountId } = await getClinicStripeAccount(appt.clinicId);
      chargeResult = await attemptCancelCharge({
        appointment: { ...appt, status: "cancelled" },
        clinicStripeAccountId: stripeAccountId,
        tiers: policy?.tiers ?? null,
        graceHours: policy?.graceHours ?? 24,
        isNoShow: false,
        eventAt: now,
        actor: "system",
      });
    }

    return NextResponse.json({ ok: true, charge: chargeResult });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
