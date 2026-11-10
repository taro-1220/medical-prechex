import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAllAppointments, getAppointmentById } from "@/lib/store";
import type { Appointment } from "@/lib/types";
import { selectReminderTargets, reminderEmailOf } from "@/lib/reminder-targets";
import { isEmailSendEnabled, sendAppointmentReminderEmail } from "@/lib/notify-email";
import { reminderAlreadySentIds, recordReminderSent, REMINDER_NOTIFICATION_TYPE } from "@/lib/reminder-store";
import { REMINDER_CLINIC_LIMIT, REMINDER_TOTAL_LIMIT } from "@/lib/notification-limits";
import { recordNotificationRun, setEmailLastFailedAt } from "@/lib/notification-run-store";

// Vercel Cron専用。毎日17:00 JST、3日後・翌日の予約（確認待ち/確認済み）にリマインドメールを送る。
// vercel.jsonのcrons設定から `Authorization: Bearer $CRON_SECRET` 付きで呼ばれる想定。
// ENABLE_REMINDER_SEND !== "true" の間は、対象件数のみ返し送信しない（試運転と同じ扱い）。
function isReminderSendEnabled(): boolean {
  return process.env.ENABLE_REMINDER_SEND === "true";
}

const OK_STATUSES = new Set(["confirmation_pending", "confirmed", "ticket_issued"]);

type ReminderKind = "threeDaysBefore" | "dayBefore";
const DAYS_BEFORE: Record<ReminderKind, 1 | 3> = { threeDaysBefore: 3, dayBefore: 1 };
type Counts = { sent: number; failed: number; skipped: number; capped: number };
const emptyCounts = (): Counts => ({ sent: 0, failed: 0, skipped: 0, capped: 0 });

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

  const allIds = appointments.map((a) => a.id);
  const [threeDaysSent, daySent] = await Promise.all([
    reminderAlreadySentIds(allIds, REMINDER_NOTIFICATION_TYPE.threeDaysBefore),
    reminderAlreadySentIds(allIds, REMINDER_NOTIFICATION_TYPE.dayBefore),
  ]);
  const targets = selectReminderTargets(appointments, nowIso, { threeDaysBefore: threeDaysSent, dayBefore: daySent });

  if (req.nextUrl.searchParams.get("dry") === "1") {
    const clinicCount = new Set([...targets.threeDaysBefore, ...targets.dayBefore].map((a) => a.clinicId)).size;
    return NextResponse.json({
      dryRun: true,
      targetCount: targets.threeDaysBefore.length + targets.dayBefore.length,
      threeDaysBeforeCount: targets.threeDaysBefore.length,
      dayBeforeCount: targets.dayBefore.length,
      clinicCount,
    });
  }

  if (!isReminderSendEnabled() || !isEmailSendEnabled()) {
    const skipped = targets.threeDaysBefore.length + targets.dayBefore.length;
    return NextResponse.json({ sent: 0, skipped, failed: 0, capped: 0 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let capped = 0;
  const perClinicSent = new Map<string, number>();
  const byType: Record<ReminderKind, Counts> = { threeDaysBefore: emptyCounts(), dayBefore: emptyCounts() };
  const breakdownByType: Record<ReminderKind, Record<string, Counts>> = { threeDaysBefore: {}, dayBefore: {} };
  const bump = (kind: ReminderKind, clinicId: string, key: keyof Counts) => {
    const map = breakdownByType[kind];
    const row = map[clinicId] ?? (map[clinicId] = emptyCounts());
    row[key]++;
    byType[kind][key]++;
  };

  const queue: { appt: Appointment; kind: ReminderKind }[] = [
    ...targets.threeDaysBefore.map((appt) => ({ appt, kind: "threeDaysBefore" as const })),
    ...targets.dayBefore.map((appt) => ({ appt, kind: "dayBefore" as const })),
  ];

  for (const { appt, kind } of queue) {
    if (!appt.clinicId) { failed++; byType[kind].failed++; continue; }

    // C: 送信上限（1クリニック100件・全体1,000件）。2種別の合算で数える。超えたクリニックは残りを送らず「上限で停止」として数える
    if (sent >= REMINDER_TOTAL_LIMIT || (perClinicSent.get(appt.clinicId) ?? 0) >= REMINDER_CLINIC_LIMIT) {
      capped++;
      bump(kind, appt.clinicId, "capped");
      continue;
    }

    // B: 送信直前の再取得。キャンセル・期限切れ・来院済み・完了、または日時が変わっていれば送らない
    const fresh = await getAppointmentById(appt.id);
    if (!fresh || !OK_STATUSES.has(fresh.status) || fresh.appointmentAt !== appt.appointmentAt) {
      skipped++;
      bump(kind, appt.clinicId, "skipped");
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
      daysBefore: DAYS_BEFORE[kind],
    });
    if (result.ok) {
      await recordReminderSent(
        appt.id,
        kind === "threeDaysBefore" ? REMINDER_NOTIFICATION_TYPE.threeDaysBefore : REMINDER_NOTIFICATION_TYPE.dayBefore,
      );
      await setEmailLastFailedAt(appt.id, null);
      sent++;
      perClinicSent.set(appt.clinicId, (perClinicSent.get(appt.clinicId) ?? 0) + 1);
      bump(kind, appt.clinicId, "sent");
    } else {
      await setEmailLastFailedAt(appt.id, new Date().toISOString());
      failed++;
      bump(kind, appt.clinicId, "failed");
    }
  }

  await recordNotificationRun({
    notificationType: REMINDER_NOTIFICATION_TYPE.threeDaysBefore,
    startedAt: startedAtIso,
    sentCount: byType.threeDaysBefore.sent,
    failedCount: byType.threeDaysBefore.failed,
    skippedCount: byType.threeDaysBefore.skipped,
    cappedCount: byType.threeDaysBefore.capped,
    clinicBreakdown: breakdownByType.threeDaysBefore,
  });
  await recordNotificationRun({
    notificationType: REMINDER_NOTIFICATION_TYPE.dayBefore,
    startedAt: startedAtIso,
    sentCount: byType.dayBefore.sent,
    failedCount: byType.dayBefore.failed,
    skippedCount: byType.dayBefore.skipped,
    cappedCount: byType.dayBefore.capped,
    clinicBreakdown: breakdownByType.dayBefore,
  });

  return NextResponse.json({ sent, skipped, failed, capped });
}
