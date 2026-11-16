import { NextRequest, NextResponse } from "next/server";
import { requireClinicAccess } from "@/lib/clinic-access";
import { deactivateClinicStaffMember } from "@/lib/clinic-staff-store";

// 無効化のみ（物理削除はしない）。スタッフ管理は「設定」の権限のみ
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const clinicId = body?.clinicId as string | undefined;
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

  const access = await requireClinicAccess(req, clinicId, "settings", { requireActive: true });
  if (!access.ok) return access.response;

  if (body?.active !== false) {
    return NextResponse.json({ error: "only_deactivation_supported" }, { status: 400 });
  }
  const ok = await deactivateClinicStaffMember(clinicId, id);
  if (!ok) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
