import { NextRequest, NextResponse } from "next/server";
import { getAppointment } from "@/lib/store";
import { getClinicStripeAccount } from "@/lib/charge-store";
import { retrievePaymentIntent } from "@/lib/stripe";

// D-3: requires_action時、チケット画面からその場で3DS再認証するためのclient_secretを返す
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const appt = await getAppointment(token);
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (appt.chargeStatus !== "requires_action" || !appt.stripePaymentIntentId || !appt.clinicId) {
      return NextResponse.json({ error: "no reauth needed" }, { status: 400 });
    }
    const { stripeAccountId } = await getClinicStripeAccount(appt.clinicId);
    if (!stripeAccountId) return NextResponse.json({ error: "clinic stripe account not found" }, { status: 409 });

    const intent = await retrievePaymentIntent(stripeAccountId, appt.stripePaymentIntentId);
    if (!intent.client_secret) return NextResponse.json({ error: "client_secret missing" }, { status: 500 });

    return NextResponse.json({ clientSecret: intent.client_secret, connectedAccountId: stripeAccountId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
