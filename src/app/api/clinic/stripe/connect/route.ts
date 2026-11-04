import { NextRequest, NextResponse } from "next/server";
import { requireClinicAccess } from "@/lib/clinic-access";
import { getClinicStripeAccount, upsertClinicStripeAccount } from "@/lib/charge-store";
import { createConnectExpressAccount, createAccountOnboardingLink } from "@/lib/stripe";

// 医院のStripe Connect Express オンボーディングを開始する。
// 既存accountが無ければ作成し、Account Link（オンボーディング導線URL）を返す。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clinicId = body?.clinicId as string | undefined;
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

  // Stripe Connect は owner のみ。承認制(Phase P1): 未承認(pending_approval/rejected)の医院は不可
  const access = await requireClinicAccess(req, clinicId, "stripe", { requireActive: true });
  if (!access.ok) return access.response;

  try {
    let { stripeAccountId } = await getClinicStripeAccount(clinicId);
    if (!stripeAccountId) {
      stripeAccountId = await createConnectExpressAccount(access.user.email ?? `clinic-${clinicId}@medipre.jp`);
      await upsertClinicStripeAccount(clinicId, { stripeAccountId, stripeAccountStatus: "pending" });
    }

    const origin = req.nextUrl.origin;
    const url = await createAccountOnboardingLink(
      stripeAccountId,
      `${origin}/clinic/onboarding?stripe=refresh`,
      `${origin}/clinic/onboarding?stripe=return`,
    );
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[api/clinic/stripe/connect] failed", { clinicId, error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
