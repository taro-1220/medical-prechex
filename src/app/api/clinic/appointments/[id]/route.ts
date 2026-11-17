import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authorizeClinicAccess } from "@/lib/clinic-access";
import { getAppointmentById, updateAppointmentHandoff } from "@/lib/store";
import { getClinicStaffMember } from "@/lib/clinic-staff-store";
import { canEditHandoffFields } from "@/lib/clinic-appointments-view";
import { addAppointmentNote } from "@/lib/appointment-notes-store";

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

// 担当の更新のみ（選択時に即保存する想定）。来院済み（checked_in以降）は編集不可。
// 備考(handoff_note)の書き換えはここでは行わない（appointment_notesへの追記に移行したため）。
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

    // 予約業務（担当の記録）のため reservation 権限
    const access = await authorizeClinicAccess(user, appt.clinicId, "reservation", { requireActive: true });
    if (!access.ok) return access.response;

    if (!canEditHandoffFields(appt.status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    if (!("staffId" in body)) {
      return NextResponse.json({ error: "staffId required" }, { status: 400 });
    }

    const newStaffId = (body.staffId as string | null) || null;
    let newStaffName: string | null = null;
    if (newStaffId) {
      const staff = await getClinicStaffMember(newStaffId);
      if (!staff || staff.clinicId !== appt.clinicId) {
        return NextResponse.json({ error: "invalid_staff" }, { status: 400 });
      }
      newStaffName = staff.name;
    }

    const oldStaffId = appt.staffId ?? null;
    const result = await updateAppointmentHandoff(id, { staffId: newStaffId });
    if (!result.ok) return NextResponse.json({ error: "not_supported" }, { status: 503 });

    if (newStaffId !== oldStaffId) {
      const from = appt.staffNameSnapshot ?? "なし";
      const to = newStaffName ?? "なし";
      await addAppointmentNote(id, appt.clinicId, "staff_change", `担当を ${from} → ${to} に変更`, user.email ?? "").catch(() => {});
    }

    return NextResponse.json({ ok: true, staffId: newStaffId, staffName: newStaffName });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
