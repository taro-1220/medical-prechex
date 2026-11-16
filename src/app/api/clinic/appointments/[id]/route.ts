import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authorizeClinicAccess } from "@/lib/clinic-access";
import { getAppointmentById, updateAppointmentHandoff } from "@/lib/store";
import { getClinicStaffMember } from "@/lib/clinic-staff-store";
import { canEditHandoffFields } from "@/lib/clinic-appointments-view";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 予約詳細。スタッフ認証(Bearer + clinic_users所属)が必須。他院の予約は存在を知らせず403。
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const appt = await getAppointmentById(id);
    if (!appt || !appt.clinicId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // 既存予約の閲覧のため承認状態は問わない（judgment APIと同様）
    const access = await authorizeClinicAccess(user, appt.clinicId, "view");
    if (!access.ok) return access.response;

    return NextResponse.json(appt);
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// 担当・備考の更新。来院済み（checked_in以降）は編集不可
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const appt = await getAppointmentById(id);
    if (!appt || !appt.clinicId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // 予約業務（担当・備考の記録）のため reservation 権限
    const access = await authorizeClinicAccess(user, appt.clinicId, "reservation", { requireActive: true });
    if (!access.ok) return access.response;

    if (!canEditHandoffFields(appt.status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const updates: { staffId?: string | null; handoffNote?: string | null } = {};

    if ("staffId" in body) {
      const staffId = (body.staffId as string | null) || null;
      if (staffId) {
        const staff = await getClinicStaffMember(staffId);
        if (!staff || staff.clinicId !== appt.clinicId) {
          return NextResponse.json({ error: "invalid_staff" }, { status: 400 });
        }
      }
      updates.staffId = staffId;
    }

    if ("handoffNote" in body) {
      const note = typeof body.handoffNote === "string" ? body.handoffNote.trim() : "";
      if (note.length > 500) {
        return NextResponse.json({ error: "handoff_note_too_long" }, { status: 400 });
      }
      updates.handoffNote = note || null;
    }

    const result = await updateAppointmentHandoff(id, updates);
    if (!result.ok) return NextResponse.json({ error: "not_supported" }, { status: 503 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
