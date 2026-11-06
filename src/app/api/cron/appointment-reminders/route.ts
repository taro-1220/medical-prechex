import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAllAppointments, getAppointmentById } from "@/lib/store";
import { selectReminderTargets, reminderEmailOf } from "@/lib/reminder-targets";
import { isEmailSendEnabled, sendAppointmentReminderEmail } from "@/lib/notify-email";
import { reminderAlreadySentIds, recordReminderSent } from "@/lib/reminder-store";
import { REMINDER_CLINIC_LIMIT, REMINDER_TOTAL_LIMIT } from "@/lib/notification-limits";
import { recordNotificationRun, setEmailLastFailedAt } from "@/lib/notification-run-store";

// Vercel Cron専用。毎日17:00 JST、翌日の予約（確認待ち/確認済み）にリマインドメールを送る。
// vercel.jsonのcrons設定から `Authorization: Bearer $CRON_SECRET` 付きで呼ばれる想定。
// ENABLE_REMINDER_SEND !== "true" の間は、対象件数のみ返し送信しない（試運転と同じ扱い）。
function isReminderSendEnabled(): boolean {
  return process.env.ENABLE_REMINDER_SEND === "true";
}

const OK_STATUSES = new Set(["confirmation_pending", "confirmed", "ticket_issued"]);
const NOTIFICATION_TYPE = "reminder_day_before";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAtIso = new Date().toISOString();
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
    return NextResponse.json({ sent: 0, skipped: targets.length, failed: 0, capped: 0 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let capped = 0;
  const perClinicSent = new Map<string, number>();
  const breakdown: Record<string, { sent: number; failed: number; skipped: number; capped: number }> = {};
  const bump = (clinicId: string, key: "sent" | "failed" | "skipped" | "capped") => {
    const row = breakdown[clinicId] ?? (breakdown[clinicId] = { sent: 0, failed: 0, skipped: 0, capped: 0 });
    row[key]++;
  };

  for (const appt of targets) {
    if (!appt.clinicId) { failed++; continue; }

    // C: 送信上限（1クリニック100件・全体1,000件）。超えたクリニックは残りを送らず「上限で停止」として数える
    if (sent >= REMINDER_TOTAL_LIMIT || (perClinicSent.get(appt.clinicId) ?? 0) >= REMINDER_CLINIC_LIMIT) {
      capped++;
      bump(appt.clinicId, "capped");
      continue;
    }

    // B: 送信直前の再取得。キャンセル・期限切れ・来院済み・完了、または日時が変わっていれば送らない
    const fresh = await getAppointmentById(appt.id);
    if (!fresh || !OK_STATUSES.has(fresh.status) || fresh.appointmentAt !== appt.appointmentAt) {
      skipped++;
      bump(appt.clinicId, "skipped");
      continue;
    }

    const clinic = clinicById.get(appt.clinicId);
    const confirmUrl = fresh.status === "confirmation_pending" ? `${appUrl}/confirm/${fresh.token}` : null;
    const result = await sendAppointmentReminderEmail({
      to: reminderEmailOf(fresh),
      clinicName: clinic?.name ?? fresh.clinicName,
      clinicPhone: clinic?.phone ?? "",
      appointmentAt: fresh.appointmentAt,
      confirmUrl,
    });
    if (result.ok) {
      await recordReminderSent(appt.id);
      await setEmailLastFailedAt(appt.id, null);
      sent++;
      perClinicSent.set(appt.clinicId, (perClinicSent.get(appt.clinicId) ?? 0) + 1);
      bump(appt.clinicId, "sent");
    } else {
      await setEmailLastFailedAt(appt.id, new Date().toISOString());
      failed++;
      bump(appt.clinicId, "failed");
    }
  }

  await recordNotificationRun({
    notificationType: NOTIFICATION_TYPE,
    startedAt: startedAtIso,
    sentCount: sent,
    failedCount: failed,
    skippedCount: skipped,
    cappedCount: capped,
    clinicBreakdown: breakdown,
  });

  return NextResponse.json({ sent, skipped, failed, capped });
}
