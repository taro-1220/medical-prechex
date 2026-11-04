import { NextRequest, NextResponse } from "next/server";
import { getAppointment, updateStatus } from "@/lib/store";
import { authenticateRequest, authorizeClinicAccess } from "@/lib/clinic-access";

// スタッフ専用。診察完了は来院済み（checked_in）の予約に対してのみクリニック所属スタッフが行える
// （来院前の予約を直接completedにして来院確認・キャンセル料判定を迂回できないようにする）
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

    if (appt.status === "completed") {
      return NextResponse.json({ ok: true, alreadyCompleted: true });
    }
    if (appt.status !== "checked_in") {
      return NextResponse.json({ error: "invalid_status", current: appt.status }, { status: 409 });
    }
    const ok = await updateStatus(token, "completed");
    if (!ok) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
