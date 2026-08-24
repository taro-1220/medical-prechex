import { NextRequest, NextResponse } from "next/server";
import { getAppointment } from "@/lib/store";
import { getClinicStripeAccount, recordChargeResult, insertChargeEvent } from "@/lib/charge-store";
import { retrievePaymentIntent } from "@/lib/stripe";
import type { ChargeStatus } from "@/lib/types";

// D-3: クライアント側のconfirmCardPayment完了後、サーバー側で最終状態を再確認して記録する
export async function POST(
  _: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const appt = await getAppointment(token);
    if (!appt || !appt.clinicId || !appt.stripePaymentIntentId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { stripeAccountId } = await getClinicStripeAccount(appt.clinicId);
    if (!stripeAccountId) return NextResponse.json({ error: "clinic stripe account not found" }, { status: 409 });

    const intent = await retrievePaymentIntent(stripeAccountId, appt.stripePaymentIntentId);
    const chargeStatus: ChargeStatus =
      intent.status === "succeeded" ? "charged" : intent.status === "requires_action" ? "requires_action" : "failed";

    const now = new Date().toISOString();
    await recordChargeResult(appt.id, { chargeStatus, chargedAmount: appt.chargedAmount, chargeExecutedAt: now });
    await insertChargeEvent({
      appointmentId: appt.id, clinicId: appt.clinicId, eventType: chargeStatus === "failed" ? "failure" : "charge",
      amount: appt.chargedAmount, stripeReferenceId: appt.stripePaymentIntentId, actor: "system", dryRun: false,
      detail: `3DS再認証結果: ${chargeStatus}`,
    });

    return NextResponse.json({ ok: true, chargeStatus });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
