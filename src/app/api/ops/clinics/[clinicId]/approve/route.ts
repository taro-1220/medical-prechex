import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isEmailSendEnabled, sendClinicApprovedEmail } from "@/lib/notify-email";

function isOpsAdmin(email: string): boolean {
  const allowed = (process.env.OPS_ADMIN_EMAILS ?? "")
    .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOpsAdmin(user.email ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
