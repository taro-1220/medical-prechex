import { NextRequest, NextResponse } from "next/server";
import { getAppointment } from "@/lib/store";
import { getClinicStripeAccount, recordSetupIntent } from "@/lib/charge-store";
import { createAppointmentSetupIntent } from "@/lib/stripe";

// D-1: カード登録用SetupIntent作成。登録のみで課金は一切発生しない（常に実際にStripeを呼ぶ。
// ENABLE_CHARGE_EXECUTIONの対象外＝課金実行ではないため）
export async function POST(
  _: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const appt = await getAppointment(token);
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!appt.clinicId) return NextResponse.json({ error: "clinic not resolved" }, { status: 500 });
    if (!appt.cardRegistrationRequired) {
      return NextResponse.json({ error: "card registration not required for this appointment" }, { status: 400 });
    }

    const { stripeAccountId, stripeAccountStatus } = await getClinicStripeAccount(appt.clinicId);
    if (!stripeAccountId || stripeAccountStatus !== "active") {
      return NextResponse.json({ error: "clinic stripe account not ready" }, { status: 409 });
    }

    const { setupIntentId, clientSecret } = await createAppointmentSetupIntent({
      connectedAccountId: stripeAccountId,
      appointmentId: appt.id,
    });
    await recordSetupIntent(token, setupIntentId);

    return NextResponse.json({ clientSecret, connectedAccountId: stripeAccountId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
