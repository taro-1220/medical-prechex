import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authorizeClinicAccess } from "@/lib/clinic-access";
import { getAppointmentById } from "@/lib/store";

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
