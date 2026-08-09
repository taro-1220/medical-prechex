import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isOpsAdmin(email: string): boolean {
  const allowed = (process.env.OPS_ADMIN_EMAILS ?? "")
    .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

const isConfirmed = (consentAt: unknown) => consentAt != null;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  const { clinicId } = await params;

  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOpsAdmin(user.email ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // UUID形式でなければDBへ問い合わせず404（存在しない医院と同じ）
  if (!UUID_RE.test(clinicId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sb = getSupabase();

  const [clinicRes, apptRes, patientRes, onboardingRes, profileRes, usersRes, templatesRes] = await Promise.all([
    sb.from("clinics").select("*").eq("id", clinicId).maybeSingle(),
    sb.from("appointments")
      .select("id, patient_name, appointment_at, status, description, cancellation_policy, consent_at, line_sent_at, sms_sent_at, email_sent_at, created_at")
      .eq("clinic_id", clinicId)
      .order("appointment_at", { ascending: false }),
    sb.from("patients").select("id").eq("clinic_id", clinicId),
    sb.from("onboarding_progress").select("*").eq("clinic_id", clinicId).maybeSingle(),
    sb.from("clinic_profile").select("*").eq("clinic_id", clinicId).maybeSingle(),
    sb.from("clinic_users").select("user_id, role").eq("clinic_id", clinicId),
    sb.from("message_templates").select("channel").eq("clinic_id", clinicId),
  ]);

  if (clinicRes.error || apptRes.error) return NextResponse.json({ error: "internal_error" }, { status: 500 });
  if (!clinicRes.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const c = clinicRes.data;
  const apptRows = apptRes.data ?? [];

  let confirmedCount = 0, lineSentCount = 0, smsSentCount = 0, emailSentCount = 0;
  const appointments = apptRows.map(a => {
    if (isConfirmed(a.consent_at)) confirmedCount++;
    if (a.line_sent_at)  lineSentCount++;
    if (a.sms_sent_at)   smsSentCount++;
    if (a.email_sent_at) emailSentCount++;
    return {
      id:            a.id as string,
      patientName:   a.patient_name as string,   // OPSが医院内で予約を識別するのに必要な範囲。連絡先(phone/email)は含めない
      appointmentAt: a.appointment_at as string,
      status:        a.status as string,
      description:   a.description as string,
      confirmedAt:   (a.consent_at as string | null) ?? null,
      lineSentAt:    (a.line_sent_at as string | null) ?? null,
      smsSentAt:     (a.sms_sent_at as string | null) ?? null,
      emailSentAt:   (a.email_sent_at as string | null) ?? null,
    };
  });

  const profile = profileRes.data as Record<string, unknown> | null;
  const templateChannels = (templatesRes.data ?? []).map(t => t.channel as string);

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
    onboarding:         onboardingRes.data ?? null,
    clinicProfile:      profile,
    cancellationPolicy: (profile?.cancellation_policy as string | undefined) ?? null,
    appointmentCount:   apptRows.length,
    confirmedCount,
    unconfirmedCount:   apptRows.length - confirmedCount,
    patientCount:       (patientRes.data ?? []).length,
    lineSentCount,
    smsSentCount,
    emailSentCount,
    templateChannels,
    hasTemplates:       templateChannels.length > 0,
    users:              usersRes.data ?? [],
    appointments,
  });
}
