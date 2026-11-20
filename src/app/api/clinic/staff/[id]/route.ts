import { NextRequest, NextResponse } from "next/server";
import { requireClinicAccess } from "@/lib/clinic-access";
import { deactivateClinicStaffMember, reactivateClinicStaffMember } from "@/lib/clinic-staff-store";

// 無効化と、有効への戻し（物理削除はしない）。スタッフ管理は「設定」の権限のみ
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

  if (typeof body?.active !== "boolean") {
    return NextResponse.json({ error: "active required" }, { status: 400 });
  }

  if (body.active === true) {
    const result = await reactivateClinicStaffMember(clinicId, id);
    if (result.ok) return NextResponse.json({ ok: true });
    if (result.reason === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (result.reason === "duplicate_name") {
      return NextResponse.json({ error: "同じ名前のスタッフが登録されています" }, { status: 409 });
    }
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  const ok = await deactivateClinicStaffMember(clinicId, id);
  if (!ok) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
