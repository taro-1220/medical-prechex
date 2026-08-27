import { NextRequest, NextResponse } from "next/server";
import { getAppointment } from "@/lib/store";
import { getClinicStripeAccount, recordPaymentMethod } from "@/lib/charge-store";
import { retrieveSetupIntent, attachPaymentMethodToCustomer } from "@/lib/stripe";

// D-1: クライアントでの3DS込みのSetupIntent確認が終わった後、実際にsucceededしているかを
// サーバー側で再確認してからpayment_method_idを保存する（クライアント申告のみを信用しない）
export async function POST(
  _: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const appt = await getAppointment(token);
    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!appt.clinicId || !appt.stripeSetupIntentId) {
      return NextResponse.json({ error: "setup intent not started" }, { status: 400 });
    }

    const { stripeAccountId } = await getClinicStripeAccount(appt.clinicId);
    if (!stripeAccountId) return NextResponse.json({ error: "clinic stripe account not found" }, { status: 409 });

    const intent = await retrieveSetupIntent(stripeAccountId, appt.stripeSetupIntentId);
    if (intent.status !== "succeeded" || !intent.payment_method) {
      return NextResponse.json({ error: "setup_incomplete", status: intent.status }, { status: 409 });
    }

    const paymentMethodId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method.id;

    // 検収で発覚した不具合の修正: 後日の別PaymentIntentで再利用できるよう、Customerへ明示的にattachする
    if (intent.customer) {
      const customerId = typeof intent.customer === "string" ? intent.customer : intent.customer.id;
      await attachPaymentMethodToCustomer(stripeAccountId, paymentMethodId, customerId);
    }

    await recordPaymentMethod(token, paymentMethodId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
