import { NextRequest, NextResponse } from "next/server";
import { requireClinicAccess } from "@/lib/clinic-access";
import { listClinicStaff, addClinicStaffMember } from "@/lib/clinic-staff-store";

export async function GET(req: NextRequest) {
  const clinicId = req.nextUrl.searchParams.get("clinic_id");
  if (!clinicId) return NextResponse.json({ error: "clinic_id required" }, { status: 400 });
  const access = await requireClinicAccess(req, clinicId, "view", { requireActive: true });
  if (!access.ok) return access.response;

  const activeOnly = req.nextUrl.searchParams.get("active_only") === "true";
  const members = await listClinicStaff(clinicId, activeOnly);
  return NextResponse.json({ members });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clinicId = body?.clinicId as string | undefined;
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });
  // スタッフ名簿の追加・無効化は「設定」の権限のみ
  const access = await requireClinicAccess(req, clinicId, "settings", { requireActive: true });
  if (!access.ok) return access.response;

  const name = typeof body?.name === "string" ? body.name : "";
  const result = await addClinicStaffMember(clinicId, name);
  if (!result.ok) {
    if (result.reason === "invalid") return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    return NextResponse.json({ error: "not_supported" }, { status: 503 });
  }
  return NextResponse.json({ member: result.member });
}
