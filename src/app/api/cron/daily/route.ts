import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getClinicCancelPolicySettings } from "@/lib/store";
import {
  findNoShowCandidates,
  findFailedChargesForRetry,
  getClinicStripeAccount,
  getChargeEventsForAppointment,
} from "@/lib/charge-store";
import { attemptCancelCharge, attemptRetryCharge } from "@/lib/charge-execution";

// Vercel Cron専用。毎日1回、E-2（無断判定・当日終了時=翌日0時JSTを過ぎた確定予約）と
// E-3（課金失敗の翌日1回リトライ）を行う。vercel.jsonのcrons設定から
// `Authorization: Bearer $CRON_SECRET` 付きで呼ばれる想定。
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabase();
  const { data: clinics, error: clinicsErr } = await sb.from("clinics").select("id");
  if (clinicsErr) return NextResponse.json({ error: clinicsErr.message }, { status: 500 });
  const clinicIds = (clinics ?? []).map((c) => c.id as string);

  const now = new Date().toISOString();
  const results = { noShow: [] as unknown[], retry: [] as unknown[] };

  // E-2: 無断判定
  const noShowCandidates = await findNoShowCandidates(clinicIds, now);
  for (const appt of noShowCandidates) {
    if (!appt.clinicId || appt.treatmentCategory === "other") continue;
    const settings = await getClinicCancelPolicySettings(appt.clinicId);
    const policy = settings.policies[appt.treatmentCategory as "private" | "insurance"];
    const { stripeAccountId } = await getClinicStripeAccount(appt.clinicId);
    const r = await attemptCancelCharge({
      appointment: appt,
      clinicStripeAccountId: stripeAccountId,
      tiers: policy?.tiers ?? null,
      graceHours: policy?.graceHours ?? 24,
      isNoShow: true,
      eventAt: now,
      actor: "system",
    });
    results.noShow.push({ appointmentId: appt.id, ...r });
  }

  // E-3: 課金失敗の翌日1回リトライ（既にretryイベントがある予約はスキップ＝1回のみ保証）
  const failedCandidates = await findFailedChargesForRetry(clinicIds);
  for (const appt of failedCandidates) {
    if (!appt.clinicId) continue;
    const events = await getChargeEventsForAppointment(appt.id);
    if (events.some((e) => e.eventType === "retry")) continue;
    const { stripeAccountId } = await getClinicStripeAccount(appt.clinicId);
    if (!stripeAccountId) continue;
    const r = await attemptRetryCharge(appt, stripeAccountId);
    results.retry.push({ appointmentId: appt.id, ...r });
  }

  return NextResponse.json({ ok: true, at: now, ...results });
}
