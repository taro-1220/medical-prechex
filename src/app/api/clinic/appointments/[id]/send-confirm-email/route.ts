import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authorizeClinicAccess } from "@/lib/clinic-access";
import { getAppointmentById } from "@/lib/store";
import { sendConfirmationEmailAndRecord } from "@/lib/confirm-email";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 確認URLメールの再送。医院スコープ・staff以上(reservation権限)・承認状態(active)を確認する。
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const appt = await getAppointmentById(id);
    if (!appt || !appt.clinicId) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const access = await authorizeClinicAccess(user, appt.clinicId, "reservation", { requireActive: true });
    if (!access.ok) return access.response;

    const result = await sendConfirmationEmailAndRecord(appt);
    if (!result.ok) {
      if (result.reason === "invalid_status") return NextResponse.json({ ok: false, reason: result.reason }, { status: 409 });
      if (result.reason === "no_email") return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
      return NextResponse.json({ ok: false, reason: result.reason }, { status: 200 });
    }
    return NextResponse.json({ ok: true, sentAt: result.sentAt });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
