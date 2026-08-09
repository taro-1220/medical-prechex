import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

function isOpsAdmin(email: string): boolean {
  const allowed = (process.env.OPS_ADMIN_EMAILS ?? "")
    .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

// 患者が確認URLで同意したものを「確認済み」とみなす（consent_at が唯一の確定シグナル）
const isConfirmed = (consentAt: unknown) => consentAt != null;

export async function GET(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOpsAdmin(user.email ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sb = getSupabase();

  const [clinicsRes, apptRes, patientRes, onboardingRes] = await Promise.all([
    sb.from("clinics").select("id, name, slug, status, created_at").order("created_at", { ascending: false }),
    sb.from("appointments")
      .select("clinic_id, appointment_at, status, consent_at, line_sent_at, sms_sent_at, email_sent_at, created_at")
      .not("clinic_id", "is", null),
    sb.from("patients").select("clinic_id").not("clinic_id", "is", null),
    sb.from("onboarding_progress").select("clinic_id, activated_at"),
  ]);

  if (clinicsRes.error) return NextResponse.json({ error: "internal_error" }, { status: 500 });

  const clinicRows = clinicsRes.data ?? [];
  const appts = apptRes.data ?? [];
  const patients = patientRes.data ?? [];
  const nameById: Record<string, string> = {};
  for (const c of clinicRows) nameById[c.id as string] = c.name as string;

  const todayStr = new Date().toISOString().slice(0, 10);

  // 医院別集計
  type Agg = { appt: number; confirmed: number; last: string | null; line: number; sms: number; email: number };
  const agg: Record<string, Agg> = {};
  let totalAppointments = 0, confirmedAppointments = 0, todayAppointments = 0;
  let lineSentCount = 0, smsSentCount = 0, emailSentCount = 0;
  for (const r of appts) {
    const cid = r.clinic_id as string;
    const a = agg[cid] ?? { appt: 0, confirmed: 0, last: null, line: 0, sms: 0, email: 0 };
    a.appt++; totalAppointments++;
    const at = r.appointment_at as string;
    if (a.last === null || new Date(at).getTime() > new Date(a.last).getTime()) a.last = at;
    if (isConfirmed(r.consent_at)) { a.confirmed++; confirmedAppointments++; }
    if (r.line_sent_at)  { a.line++;  lineSentCount++; }
    if (r.sms_sent_at)   { a.sms++;   smsSentCount++; }
    if (r.email_sent_at) { a.email++; emailSentCount++; }
    if (at?.startsWith(todayStr)) todayAppointments++;
    agg[cid] = a;
  }

  const patientCountMap: Record<string, number> = {};
  for (const r of patients) {
    const cid = r.clinic_id as string;
    patientCountMap[cid] = (patientCountMap[cid] ?? 0) + 1;
  }

  const activatedMap: Record<string, string | null> = {};
  for (const r of onboardingRes.data ?? []) activatedMap[r.clinic_id as string] = r.activated_at as string | null;

  const clinics = clinicRows.map(c => {
    const id = c.id as string;
    const a = agg[id];
    return {
      id,
      name:              c.name,
      slug:              c.slug ?? null,
      status:            c.status,
      createdAt:         c.created_at,
      activatedAt:       activatedMap[id] ?? null,
      appointmentCount:  a?.appt ?? 0,
      confirmedCount:    a?.confirmed ?? 0,
      patientCount:      patientCountMap[id] ?? 0,
      lastAppointmentAt: a?.last ?? null,
      lineSentCount:     a?.line ?? 0,
      smsSentCount:      a?.sms ?? 0,
      emailSentCount:    a?.email ?? 0,
    };
  });

  const activeClinics = clinics.filter(c => c.activatedAt).length;

  // 直近の予約（PII非露出: 患者名は返さず、医院名・日時・状態のみ）
  const recentAppointments = [...appts]
    .sort((x, y) => new Date(y.created_at as string).getTime() - new Date(x.created_at as string).getTime())
    .slice(0, 8)
    .map(r => ({
      clinicName:    nameById[r.clinic_id as string] ?? "—",
      appointmentAt: r.appointment_at as string,
      status:        r.status as string,
      confirmed:     isConfirmed(r.consent_at),
      createdAt:     r.created_at as string,
    }));

  const recentClinics = clinicRows.slice(0, 8).map(c => ({
    id:        c.id,
    name:      c.name,
    status:    c.status,
    createdAt: c.created_at,
    activated: (activatedMap[c.id as string] ?? null) != null,
  }));

  const summary = {
    totalClinics:          clinics.length,
    activeClinics,
    pendingClinics:        clinics.length - activeClinics,
    totalPatients:         patients.length,
    totalAppointments,
    confirmedAppointments,
    unconfirmedAppointments: totalAppointments - confirmedAppointments,
    lineSentCount,
    smsSentCount,
    emailSentCount,
    todayAppointments,
  };

  return NextResponse.json({ summary, clinics, recentAppointments, recentClinics });
}
