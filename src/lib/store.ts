import { getSupabase } from "./supabase";
import type { Appointment, AppointmentStatus } from "./types";

// DB row (snake_case) → Appointment (camelCase)
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

function logError(label: string, error: { code?: string; message?: string; details?: string; hint?: string } | null) {
  console.error(`[appointments] ${label}`, {
    code:    error?.code,
    message: error?.message,
    details: error?.details,
    hint:    error?.hint,
  });
  console.error("[appointments] supabase raw error", error);
  console.error("[appointments] supabase error keys", Object.keys(error ?? {}));
  console.error("[appointments] supabase error json", JSON.stringify(error, null, 2));
}

export async function getAllAppointments(): Promise<Appointment[]> {
  console.error("[appointments] before getSupabase (getAll)");
  const db = getSupabase();
  console.error("[appointments] after getSupabase (getAll)");

  console.error("[appointments] before select (getAll)");
  const { data, error } = await db
    .from("appointments")
    .select("*")
    .order("created_at", { ascending: false });
  console.error("[appointments] after select (getAll)", { hasError: !!error, rowCount: data?.length ?? 0 });
  if (error) {
    logError("supabase error (getAll)", error);
    console.error("[appointments] getAll raw error", error);
    console.error("[appointments] getAll error keys", Object.keys(error ?? {}));
    console.error("[appointments] getAll error json", JSON.stringify(error, null, 2));
    return [];
  }
  return (data ?? []).map(toAppt);
}

export async function getAppointment(token: string): Promise<Appointment | undefined> {
  console.error("[appointments] before getSupabase (get)");
  const db = getSupabase();
  console.error("[appointments] after getSupabase (get)");

  console.error("[appointments] before select (get)");
  const { data, error } = await db
    .from("appointments")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  console.error("[appointments] after select (get)", { hasError: !!error, found: !!data });
  if (error) { logError("supabase error (get)", error); throw new Error(error.message); }
  return data ? toAppt(data) : undefined;
}

export async function createAppointment(
  input: Omit<Appointment, "id" | "token" | "status" | "createdAt">
): Promise<Appointment> {
  console.error("[appointments] before getSupabase (create)");
  const db = getSupabase();
  console.error("[appointments] after getSupabase (create)");

  console.error("[appointments] before insert");
  const { data, error } = await db
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
  console.error("[appointments] after insert", { hasError: !!error });
  if (error) { logError("supabase error (insert)", error); throw new Error(error.message); }
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

  console.error("[appointments] before getSupabase (update)");
  const db = getSupabase();
  console.error("[appointments] after getSupabase (update)");

  console.error("[appointments] before update");
  const { data, error } = await db
    .from("appointments")
    .update(patch)
    .eq("token", token)
    .select("id");
  console.error("[appointments] after update", { hasError: !!error, rowCount: data?.length ?? 0 });
  if (error) { logError("supabase error (update)", error); throw new Error(error.message); }
  return (data?.length ?? 0) > 0;
}
