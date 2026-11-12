import { NextRequest, NextResponse } from "next/server";
import { requireClinicAccess } from "@/lib/clinic-access";
import { getAppointmentDescriptionOptions, addAppointmentDescriptionOption } from "@/lib/appointment-description-options-store";

export async function GET(req: NextRequest) {
  const clinicId = req.nextUrl.searchParams.get("clinic_id");
  if (!clinicId) return NextResponse.json({ error: "clinic_id required" }, { status: 400 });
  const access = await requireClinicAccess(req, clinicId, "view", { requireActive: true });
  if (!access.ok) return access.response;

  const options = await getAppointmentDescriptionOptions(clinicId);
  return NextResponse.json({ options });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clinicId = body?.clinicId as string | undefined;
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });
  const access = await requireClinicAccess(req, clinicId, "settings", { requireActive: true });
  if (!access.ok) return access.response;

  const label = typeof body?.label === "string" ? body.label : "";
  const result = await addAppointmentDescriptionOption(clinicId, label);
  if (!result.ok) {
    if (result.reason === "invalid") return NextResponse.json({ error: "invalid_label" }, { status: 400 });
    if (result.reason === "duplicate") return NextResponse.json({ error: "duplicate" }, { status: 409 });
    return NextResponse.json({ error: "not_supported" }, { status: 503 });
  }
  return NextResponse.json({ options: result.options });
}
