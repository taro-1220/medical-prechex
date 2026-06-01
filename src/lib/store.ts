import type { Appointment, AppointmentStatus } from "./types";

// MVP: in-memory store. Hot-reload safe via globalThis. Replace with Supabase for production.
const g = globalThis as typeof globalThis & { _appointments?: Map<string, Appointment> };
if (!g._appointments) g._appointments = new Map();
const db = g._appointments;

export function getAllAppointments(): Appointment[] {
  return Array.from(db.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getAppointment(token: string): Appointment | undefined {
  return db.get(token);
}

export function createAppointment(
  data: Omit<Appointment, "id" | "token" | "status" | "createdAt">
): Appointment {
  const appt: Appointment = {
    ...data,
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    status: "confirmation_pending",
    createdAt: new Date().toISOString(),
  };
  db.set(appt.token, appt);
  return appt;
}

export function updateStatus(
  token: string,
  status: AppointmentStatus,
  extra?: Partial<Appointment>
): boolean {
  const appt = db.get(token);
  if (!appt) return false;
  db.set(token, { ...appt, status, ...extra });
  return true;
}
