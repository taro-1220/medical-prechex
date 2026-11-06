import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAllAppointments } from "@/lib/store";
import { selectReminderTargets, reminderEmailOf } from "@/lib/reminder-targets";
import { isEmailSendEnabled, sendAppointmentReminderEmail } from "@/lib/notify-email";
import { reminderAlreadySentIds, recordReminderSent } from "@/lib/reminder-store";

// Vercel Cron専用。毎日17:00 JST、翌日の予約（確認待ち/確認済み）にリマインドメールを送る。
// vercel.jsonのcrons設定から `Authorization: Bearer $CRON_SECRET` 付きで呼ばれる想定。
// ENABLE_REMINDER_SEND !== "true" の間は、対象件数のみ返し送信しない（試運転と同じ扱い）。
function isReminderSendEnabled(): boolean {
  return process.env.ENABLE_REMINDER_SEND === "true";
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabase();
  const { data: clinics, error: clinicsErr } = await sb.from("clinics").select("id, name, phone");
  if (clinicsErr) return NextResponse.json({ error: "internal_error" }, { status: 500 });
  const clinicIds = (clinics ?? []).map((c) => c.id as string);
  const clinicById = new Map((clinics ?? []).map((c) => [c.id as string, c as { name: string; phone: string }]));

  const nowIso = new Date().toISOString();
  let appointments;
  try {
    appointments = await getAllAppointments(clinicIds);
  } catch (e) {
    return NextResponse.json({ error: "internal_error", detail: String(e) }, { status: 500 });
  }

  const alreadySent = await reminderAlreadySentIds(appointments.map((a) => a.id));
  const targets = selectReminderTargets(appointments, nowIso, alreadySent);

  if (req.nextUrl.searchParams.get("dry") === "1") {
    const clinicCount = new Set(targets.map((a) => a.clinicId)).size;
    return NextResponse.json({ dryRun: true, targetCount: targets.length, clinicCount });
  }

  if (!isReminderSendEnabled() || !isEmailSendEnabled()) {
    return NextResponse.json({ sent: 0, skipped: targets.length, failed: 0 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  let sent = 0;
  let failed = 0;
  for (const appt of targets) {
    if (!appt.clinicId) { failed++; continue; }
    const clinic = clinicById.get(appt.clinicId);
    const confirmUrl = appt.status === "confirmation_pending" ? `${appUrl}/confirm/${appt.token}` : null;
    const result = await sendAppointmentReminderEmail({
      to: reminderEmailOf(appt),
      clinicName: clinic?.name ?? appt.clinicName,
      clinicPhone: clinic?.phone ?? "",
      appointmentAt: appt.appointmentAt,
      confirmUrl,
    });
    if (result.ok) {
      await recordReminderSent(appt.id);
      sent++;
    } else {
      failed++;
    }
  }

  return NextResponse.json({ sent, skipped: 0, failed });
}
