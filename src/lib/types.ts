export type AppointmentStatus =
  | "confirmation_pending"
  | "confirmed"
  | "ticket_issued"
  | "checked_in"
  | "cancelled"
  | "expired";

export type CommunicationChannel = "sms" | "email" | "line" | "manual";

export interface Appointment {
  id: string;
  token: string;
  clinicName: string;
  patientName: string;
  phone: string;
  email: string;
  communicationChannel: CommunicationChannel;
  appointmentAt: string;
  description: string;
  cancellationPolicy: string;
  status: AppointmentStatus;
  consentAt?: string;
  checkedInAt?: string;
  cancelledAt?: string;
  createdAt: string;
}
