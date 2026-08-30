import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { createAppointment } from "@/lib/store";
import {
  getSlotByNotificationToken,
  claimAvailableSlot,
  reopenAvailableSlot,
  markSlotClaimed,
  markNotificationClaimed,
} from "@/lib/available-slots-store";

// ■8 先着制御: claimAvailableSlot() 内の単一UPDATE(WHERE status='open')がサーバー側の排他制御そのもの。
// 複数患者が同時にこのAPIを叩いても、状態を'booked'に更新できるのは最初の1件だけになる。
export async function POST(
  _: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const found = await getSlotByNotificationToken(token);
    if (!found) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const claimed = await claimAvailableSlot(found.slot.id);
    if (!claimed) {
      return NextResponse.json({ ok: false, reason: "closed" }, { status: 409 });
    }

    // どの患者が通知を受けてクリックしたかは slot_notifications.token から特定済み
    const { data: notif, error: notifErr } = await getSupabase()
      .from("slot_notifications")
      .select("patient_id")
      .eq("token", token)
      .maybeSingle();
    if (notifErr || !notif?.patient_id) {
      await reopenAvailableSlot(found.slot.id);
      return NextResponse.json({ error: "notification_not_found" }, { status: 404 });
    }

    const { data: patient, error: patientErr } = await getSupabase()
      .from("patients")
      .select("id, name, phone, email")
      .eq("id", notif.patient_id)
      .maybeSingle();
    if (patientErr || !patient) {
      await reopenAvailableSlot(found.slot.id);
      return NextResponse.json({ error: "patient_not_found" }, { status: 404 });
    }

    try {
      const appt = await createAppointment(
        {
          clinicName: found.clinicName,
          patientName: patient.name as string,
          phone: (patient.phone as string) ?? "",
          email: (patient.email as string) ?? "",
          communicationChannel: "email",
          appointmentAt: found.slot.appointmentAt,
          description: "",
          cancellationPolicy: found.slot.cancellationPolicy,
          treatmentCategory: found.slot.treatmentCategory,
          cancelPolicyApplied: false,
          baseAmount: found.slot.baseAmount,
          cardRegistrationRequired: found.slot.cardRegistrationRequired,
          chargeStatus: "none",
          chargedAmount: null,
          patientId: patient.id as string,
        },
        found.slot.clinicId,
      );

      await markSlotClaimed(found.slot.id, appt.id);
      await markNotificationClaimed(found.notificationId, appt.id);

      return NextResponse.json({ ok: true, token: appt.token });
    } catch (e) {
      // 予約作成失敗時は空き枠をopenへ戻す（ベストエフォート）。通知トークンは有効のまま再試行できる
      await reopenAvailableSlot(found.slot.id).catch(() => {});
      throw e;
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
