import { getSupabase } from "./supabase";
import type { Appointment, AppointmentStatus, Patient } from "./types";

function toAppt(row: Record<string, unknown>): Appointment {
  return {
    id:                   row.id as string,
    token:                row.token as string,
    clinicName:           row.clinic_name as string,
    patientName:          row.patient_name as string,
    phone:                row.phone as string,
    email:                row.email as string,
    communicationChannel: row.communication_channel as Appointment["communicationChannel"],
    appointmentAt:        row.appointment_at as string,
    description:          row.description as string,
    cancellationPolicy:   row.cancellation_policy as string,
    status:               row.status as AppointmentStatus,
    consentAt:            row.consent_at as string | undefined,
    checkedInAt:          row.checked_in_at as string | undefined,
    clinicId:             row.clinic_id as string | undefined,
    patientId:            row.patient_id as string | undefined,
    createdAt:            row.created_at as string,
  };
}

export async function searchPatients(query: string): Promise<Patient[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await getSupabase()
    .from("patients")
    .select("id, name, phone, email")
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({
    id:    r.id    as string,
    name:  r.name  as string,
    phone: r.phone as string,
    email: r.email as string,
  }));
}

export async function getAllAppointments(): Promise<Appointment[]> {
  const { data, error } = await getSupabase()
    .from("appointments")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[appointments] getAll error", { code: error.code, message: error.message });
    throw new Error(error.message);
  }
  return (data ?? []).map(toAppt);
}

export async function getAppointment(token: string): Promise<Appointment | undefined> {
  const { data, error } = await getSupabase()
    .from("appointments")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toAppt(data) : undefined;
}

async function findOrCreateClinic(clinicName: string): Promise<string> {
  const sb = getSupabase();
  const { data: existing } = await sb
    .from("clinics")
    .select("id")
    .eq("name", clinicName)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await sb
    .from("clinics")
    .insert({ name: clinicName })
    .select("id")
    .single();
  if (error) throw new Error(`clinic insert failed: ${error.message}`);
  return data.id as string;
}

async function findOrCreatePatient(
  patientName: string,
  phone: string,
  email: string,
  clinicId: string,
): Promise<string> {
  const sb = getSupabase();
  let existingId: string | null = null;
  if (phone) {
    const { data } = await sb.from("patients").select("id").eq("phone", phone).maybeSingle();
    if (data) existingId = data.id as string;
  }
  if (!existingId && email) {
    const { data } = await sb.from("patients").select("id").eq("email", email).maybeSingle();
    if (data) existingId = data.id as string;
  }
  if (existingId) return existingId;
  const { data, error } = await sb
    .from("patients")
    .insert({ name: patientName, phone: phone ?? "", email: email ?? "", clinic_id: clinicId })
    .select("id")
    .single();
  if (error) throw new Error(`patient insert failed: ${error.message}`);
  return data.id as string;
}

export async function createAppointment(
  input: Omit<Appointment, "id" | "token" | "status" | "createdAt">
): Promise<Appointment> {
  const clinicId  = await findOrCreateClinic(input.clinicName);
  const patientId = input.patientId ?? await findOrCreatePatient(input.patientName, input.phone ?? "", input.email ?? "", clinicId);

  const { data, error } = await getSupabase()
    .from("appointments")
    .insert({
      token:                 crypto.randomUUID(),
      clinic_name:           input.clinicName,
      patient_name:          input.patientName,
      phone:                 input.phone ?? "",
      email:                 input.email ?? "",
      communication_channel: input.communicationChannel ?? "manual",
      appointment_at:        input.appointmentAt,
      description:           input.description,
      cancellation_policy:   input.cancellationPolicy,
      status:                "confirmation_pending",
      clinic_id:             clinicId,
      patient_id:            patientId,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toAppt(data);
}

export async function confirmWithConsent(token: string): Promise<boolean> {
  // 1. 予約を取得（policy_text / patient_name / appointment_at が必要）
  const appt = await getAppointment(token);
  if (!appt) return false;

  const consentAt = new Date().toISOString();

  // 2. consent_logs に先に insert（失敗時は appointments を更新しない）
  const { error: logError } = await getSupabase()
    .from("consent_logs")
    .insert({
      appointment_id: appt.id,
      token:          appt.token,
      policy_text:    appt.cancellationPolicy,
      consented_at:   consentAt,
      patient_name:   appt.patientName,
      appointment_at: appt.appointmentAt,
    });
  if (logError) throw new Error(`consent_log insert failed: ${logError.message}`);

  // 3. consent_logs 保存成功後のみ appointments を confirmed に更新
  const ok = await updateStatus(token, "confirmed", { consentAt });
  return ok;
}

export async function updateStatus(
  token: string,
  status: AppointmentStatus,
  extra?: Partial<Appointment>
): Promise<boolean> {
  const patch: Record<string, unknown> = { status };
  if (extra?.consentAt)   patch.consent_at   = extra.consentAt;
  if (extra?.checkedInAt) patch.checked_in_at = extra.checkedInAt;
  if (extra?.cancelledAt) patch.cancelled_at  = extra.cancelledAt;

  const { data, error } = await getSupabase()
    .from("appointments")
    .update(patch)
    .eq("token", token)
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}
