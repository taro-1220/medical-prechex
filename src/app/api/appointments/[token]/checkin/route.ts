import { NextRequest, NextResponse } from "next/server";
import { getAppointment, updateStatus } from "@/lib/store";
import { authenticateRequest, authorizeClinicAccess } from "@/lib/clinic-access";

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
    const ok = await updateStatus(token, "checked_in", { checkedInAt: new Date().toISOString() });
    if (!ok) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
