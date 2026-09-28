import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getClinicStripeAccount, upsertClinicStripeAccount } from "@/lib/charge-store";
import { fetchConnectAccountStatus, fetchConnectAccountDetailsSubmitted } from "@/lib/stripe";

// オンボーディング画面訪問時などにStripe側の最新状態をポーリングして反映する
// （Webhook基盤は今回新設しない。A-3で報告済みのスコープ判断）
export async function GET(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clinicId = req.nextUrl.searchParams.get("clinic_id");
  if (!clinicId) return NextResponse.json({ error: "clinic_id required" }, { status: 400 });

  const { data: cu } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!cu) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const account = await getClinicStripeAccount(clinicId);
    if (!account.stripeAccountId) return NextResponse.json(account);

    const status = await fetchConnectAccountStatus(account.stripeAccountId);
    if (status !== account.stripeAccountStatus) {
      await upsertClinicStripeAccount(clinicId, { stripeAccountStatus: status });
    }
    // セクションF-3: "pending"のときだけ、入力途中か提出済みかを画面表示用に追加取得する（DB保存はしない）
    const detailsSubmitted = status === "pending" ? await fetchConnectAccountDetailsSubmitted(account.stripeAccountId) : undefined;
    return NextResponse.json({ stripeAccountId: account.stripeAccountId, stripeAccountStatus: status, detailsSubmitted });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
