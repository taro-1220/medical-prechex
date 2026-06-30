import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

function isOpsAdmin(email: string): boolean {
  const allowed = (process.env.OPS_ADMIN_EMAILS ?? "")
    .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOpsAdmin(user.email ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { clinicId } = await params;
  const sb = getSupabase();

  const [clinicRes, apptRes, patientRes, onboardingRes, profileRes, usersRes] = await Promise.all([
    sb.from("clinics").select("*").eq("id", clinicId).maybeSingle(),
    sb.from("appointments").select("id, status").eq("clinic_id", clinicId),
    sb.from("patients").select("id").eq("clinic_id", clinicId),
    sb.from("onboarding_progress").select("*").eq("clinic_id", clinicId).maybeSingle(), // TODO: Phase2テーブル。未存在時は data=null でフォールバック
    sb.from("clinic_profile").select("*").eq("clinic_id", clinicId).maybeSingle(),      // TODO: Phase2テーブル。未存在時は data=null でフォールバック
    sb.from("clinic_users").select("user_id, role").eq("clinic_id", clinicId),
  ]);

  if (!clinicRes.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const c = clinicRes.data;
  return NextResponse.json({
    clinic: {
      id:        c.id,
      name:      c.name,
      slug:      c.slug,
      phone:     c.phone,
      email:     c.email,
      address:   c.address,
      status:    c.status,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    },
    onboarding:       onboardingRes.data ?? null,
    clinicProfile:    profileRes.data ?? null,
    appointmentCount: (apptRes.data ?? []).length,
    patientCount:     (patientRes.data ?? []).length,
    emailSentCount:   null, // TODO: implement when email_logs table exists
    lineSentCount:    null, // TODO: implement when line_logs table exists
    lastLoginAt:      null, // TODO: implement when clinic_users.last_login_at is added
    users:            usersRes.data ?? [],
  });
}
