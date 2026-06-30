export type ClinicRole = "owner" | "manager" | "staff";

export interface Clinic {
  id: string;
  name: string;
  slug: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicUser {
  id: string;
  clinicId: string;
  userId: string;
  role: ClinicRole;
  selected: boolean;
  createdAt: string;
}

export type AppointmentStatus =
  | "confirmation_pending"
  | "confirmed"
  | "ticket_issued"
  | "checked_in"
  | "completed"
  | "cancelled"
  | "expired";

export type CommunicationChannel = "sms" | "email" | "line" | "manual";

export interface Patient {
  id: string;
  name: string;
  phone: string;
  email: string;
}

export interface ClinicProfile {
  id: string;
  clinicId: string;
  clinicDisplayName: string;
  directorName: string;
  phone: string;
  email: string;
  postalCode: string;
  address: string;
  websiteUrl: string;
  cancellationPolicy: string;
  defaultMessage: string;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingProgress {
  id: string;
  clinicId: string;
  profileCompleted: boolean;
  policyCompleted: boolean;
  notificationCompleted: boolean;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  clinicId?: string;
  patientId?: string;
  createdAt: string;
}
