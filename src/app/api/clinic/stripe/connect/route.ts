import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getClinicStripeAccount, upsertClinicStripeAccount } from "@/lib/charge-store";
import { createConnectExpressAccount, createAccountOnboardingLink } from "@/lib/stripe";

// 医院のStripe Connect Express オンボーディングを開始する。
// 既存accountが無ければ作成し、Account Link（オンボーディング導線URL）を返す。
export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const clinicId = body?.clinicId as string | undefined;
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

  const { data: cu } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id, role")
    .eq("user_id", user.id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!cu || !["owner", "manager"].includes(cu.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Phase P1: 承認制。未承認（pending_approval/rejected）の医院はConnectアカウントを作成できない
  const { data: clinic } = await getSupabase()
    .from("clinics")
    .select("status")
    .eq("id", clinicId)
    .maybeSingle();
  if (clinic?.status !== "active") {
    return NextResponse.json({ error: "Forbidden: clinic not approved" }, { status: 403 });
  }

  try {
    let { stripeAccountId } = await getClinicStripeAccount(clinicId);
    if (!stripeAccountId) {
      stripeAccountId = await createConnectExpressAccount(user.email ?? `clinic-${clinicId}@medipre.jp`);
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
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
