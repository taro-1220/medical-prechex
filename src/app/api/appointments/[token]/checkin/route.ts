import { NextRequest, NextResponse } from "next/server";
import { getAppointment, updateStatus } from "@/lib/store";
import { authenticateRequest, authorizeClinicAccess } from "@/lib/clinic-access";
import { isPrecheckinVisit } from "@/lib/clinic-appointments-view";
import { handleAppointmentCancelledForSlotReopen } from "@/lib/available-slot-notify";

// スタッフ専用。来院受付はクリニック所属スタッフのみが行える（無断チェックイン防止）
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { token } = await params;
    const appt = await getAppointment(token);
    if (!appt) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (!appt.clinicId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // 通常業務のため承認済み(active)の医院のみ。role は operate 権限を要求
    const access = await authorizeClinicAccess(user, appt.clinicId, "operate", { requireActive: true });
    if (!access.ok) return access.response;

    if (appt.status === "checked_in") {
      return NextResponse.json({ ok: true, alreadyCheckedIn: true });
    }
    if (appt.status !== "confirmed") {
      return NextResponse.json({ error: "invalid_status", current: appt.status }, { status: 409 });
    }
    const checkedInAt = new Date().toISOString();
    const ok = await updateStatus(token, "checked_in", { checkedInAt });
    if (!ok) return NextResponse.json({ error: "update_failed" }, { status: 500 });

    // 前倒し来院（受付日がJSTで予約日より前）なら、本来の予約日時の枠が空くため
    // キャンセル時と同じ空き枠通知を起動する。送信可否は既存の判定にそのまま従う。
    // 受付はここで確定済みなので、通知の失敗で受付を失敗させない（ログに残すだけ）。
    // 二重受付は上の alreadyCheckedIn で return するため、通知も1回だけになる。
    if (isPrecheckinVisit(appt.appointmentAt, checkedInAt)) {
      await handleAppointmentCancelledForSlotReopen({ ...appt, status: "checked_in", checkedInAt }, appt.status)
        .catch((e) => console.warn(`[checkin] slot reopen notify failed appointmentId=${appt.id} error=${String(e)}`));
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
