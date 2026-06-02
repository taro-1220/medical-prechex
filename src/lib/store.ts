import { getSupabase } from "./supabase";
import type { Appointment, AppointmentStatus } from "./types";

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
    createdAt:            row.created_at as string,
  };
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

export async function createAppointment(
  input: Omit<Appointment, "id" | "token" | "status" | "createdAt">
): Promise<Appointment> {
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
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toAppt(data);
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
