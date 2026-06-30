import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

function isOpsAdmin(email: string): boolean {
  const allowed = (process.env.OPS_ADMIN_EMAILS ?? "")
    .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOpsAdmin(user.email ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sb = getSupabase();

  const [clinicsRes, apptRes, patientRes, onboardingRes] = await Promise.all([
    sb.from("clinics")
      .select("id, name, slug, phone, email, address, status, created_at")
      .order("created_at", { ascending: false }),
    sb.from("appointments")
      .select("clinic_id, appointment_at")
      .not("clinic_id", "is", null),
    sb.from("patients")
      .select("clinic_id")
      .not("clinic_id", "is", null),
    sb.from("onboarding_progress") // TODO: Phase2テーブル。存在しない場合は data=null になりフォールバック
      .select("clinic_id, activated_at"),
  ]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const apptCountMap: Record<string, number> = {};
  let todayAppointments = 0;
  for (const r of apptRes.data ?? []) {
    const cid = r.clinic_id as string;
    apptCountMap[cid] = (apptCountMap[cid] ?? 0) + 1;
    if ((r.appointment_at as string)?.startsWith(todayStr)) todayAppointments++;
  }

  const patientCountMap: Record<string, number> = {};
  for (const r of patientRes.data ?? []) {
    const cid = r.clinic_id as string;
    patientCountMap[cid] = (patientCountMap[cid] ?? 0) + 1;
  }

  const activatedAtMap: Record<string, string | null> = {};
  for (const r of onboardingRes.data ?? []) {
    activatedAtMap[r.clinic_id as string] = r.activated_at as string | null;
  }

  const clinics = (clinicsRes.data ?? []).map(c => ({
    id:               c.id,
    name:             c.name,
    slug:             c.slug,
    phone:            c.phone,
    email:            c.email,
    address:          c.address,
    status:           c.status,
    createdAt:        c.created_at,
    activatedAt:      activatedAtMap[c.id as string] ?? null,
    appointmentCount: apptCountMap[c.id as string] ?? 0,
    patientCount:     patientCountMap[c.id as string] ?? 0,
    emailSentCount:   null, // TODO: implement when email_logs table exists
    lineSentCount:    null, // TODO: implement when line_logs table exists
    lastLoginAt:      null, // TODO: implement when clinic_users.last_login_at is added
  }));

  const activeClinics = clinics.filter(c => c.activatedAt).length;
  const summary = {
    totalClinics:      clinics.length,
    activeClinics,
    pendingClinics:    clinics.length - activeClinics,
    todayAppointments,
    todayEmailSent:    0, // TODO
    todayLineSent:     0, // TODO
  };

  return NextResponse.json({ summary, clinics });
}
