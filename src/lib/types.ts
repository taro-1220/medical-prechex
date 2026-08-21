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

// MVP+1: キャンセルポリシー合意基盤
export type TreatmentCategory = "insurance" | "private" | "other";
export type CancelPolicyScope = "private" | "insurance" | "both";

// clinic_cancel_policies の1行（自由診療／保険診療で独立して持つ）
export interface CancelPolicy {
  treatmentCategory: "private" | "insurance";
  policyText: string;
  basisNote: string;
  showBasisToPatient: boolean;
  graceHours: number;
}

// 医院単位のキャンセル料ポリシー設定（clinic_profile拡張分 + clinic_cancel_policies）
export interface ClinicCancelPolicySettings {
  enabled: boolean;
  scope: CancelPolicyScope | null;
  insuranceAcknowledged: boolean;
  policies: {
    private: CancelPolicy | null;
    insurance: CancelPolicy | null;
  };
}

export interface Patient {
  id: string;
  name: string;
  phone: string;
  email: string;
  userId?: string | null; // Phase2+: populated on LINE login / email OTP
  createdAt?: string;
}

// 医院スタッフ向け患者一覧の1行（集計値つき、PIIは氏名/連絡先のみ）
export interface PatientListItem {
  id: string;
  name: string;
  phone: string;
  email: string;
  appointmentCount: number;
  lastAppointmentAt: string | null;
  latestStatus: AppointmentStatus | null;
}

// 患者単位の同意履歴（consent_logs を予約経由で取得）
export interface PatientConsentLog {
  id: string;
  appointmentId: string;
  consentedAt: string;
  appointmentAt: string;
  policyText: string;
}

// 患者詳細（患者1件＋予約履歴＋同意履歴）
export interface PatientDetail {
  patient: Patient;
  appointments: Appointment[];
  consents: PatientConsentLog[];
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
  cancelPolicyEnabled: boolean;
  cancelPolicyScope: CancelPolicyScope | null;
  cancelPolicyInsuranceAcknowledged: boolean;
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
  lineSentAt?: string;
  smsSentAt?: string;
  emailSentAt?: string;
  clinicId?: string;
  patientId?: string;
  createdAt: string;
  // MVP+1: キャンセルポリシー合意基盤
  treatmentCategory: TreatmentCategory;
  cancelPolicyApplied: boolean;
  /** 適用時、予約作成時点の policy_text 全文（同意前もこの内容を患者に提示する） */
  cancelPolicySnapshot?: string;
  cancelPolicyAgreedAt?: string;
  cancelRequestedAt?: string;
  // 以下はDBカラムではなく、参照時に clinic_cancel_policies / clinic_profile から都度joinする表示専用フィールド
  cancelPolicyBasisNote?: string;
  cancelPolicyShowBasisToPatient?: boolean;
  clinicPhone?: string;
}

export interface ConsentSummary {
  clinicName: string;
  consentedAt: string;
}

export interface PatientMeResponse {
  patient: Patient;
  nextAppointment: Appointment | null;
  appointmentHistory: Appointment[];
  consentHistory: ConsentSummary[];
}

export type MessageChannel = "sms" | "line" | "email";

export interface MessageTemplate {
  clinicId: string;
  channel: MessageChannel;
  subject: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

// GET /api/clinic/templates が返す、フォールバック解決込みの1チャネル分
export type TemplateSource = "custom" | "legacy_default_message" | "default";

export interface TemplateWithMeta {
  channel: MessageChannel;
  subject: string | null;
  body: string;
  source: TemplateSource;
  updatedAt: string | null;
}
