import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAppointmentById, getClinicCancelPolicySettings, updateStatus } from "@/lib/store";
import { getClinicStripeAccount } from "@/lib/charge-store";
import { attemptCancelCharge } from "@/lib/charge-execution";
import { handleAppointmentCancelledForSlotReopen } from "@/lib/available-slot-notify";

// C-4: スタッフによるキャンセル記録（判定パネルでの確認後）。E-1のスタッフ起点
export async function POST(
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

    const now = new Date().toISOString();
    await updateStatus(appt.token, "cancelled", { cancelledAt: now });

    // MVP+3: 空き枠自動通知。cancel-request側と同じく、キャンセル処理とは独立させる
    await handleAppointmentCancelledForSlotReopen({ ...appt, status: "cancelled" }, appt.status).catch(() => {});

    let chargeResult = null;
    if (appt.cancelPolicyApplied && appt.treatmentCategory !== "other") {
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
        actor: "staff",
      });
    }

    return NextResponse.json({ ok: true, charge: chargeResult });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
