import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isEmailSendEnabled, sendClinicApprovedEmail } from "@/lib/notify-email";
import { requireOpsAdmin } from "@/lib/ops-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  const auth = await requireOpsAdmin(req);
  if (!auth.ok) return auth.response;

  const { clinicId } = await params;
  if (!UUID_RE.test(clinicId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sb = getSupabase();
  const { data: clinic, error: clinicErr } = await sb
    .from("clinics")
    .select("id, name, email")
    .eq("id", clinicId)
    .maybeSingle();
  if (clinicErr) return NextResponse.json({ error: clinicErr.message }, { status: 500 });
  if (!clinic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error: updateErr } = await sb
    .from("clinics")
    .update({ status: "active" })
    .eq("id", clinicId);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  let emailSent = false;
  if (clinic.email && isEmailSendEnabled()) {
    const result = await sendClinicApprovedEmail({
      to: clinic.email as string,
      clinicName: clinic.name as string,
      loginUrl: `${appUrl}/clinic`,
    });
    emailSent = result.ok;
  }

  return NextResponse.json({ ok: true, emailSent });
}
