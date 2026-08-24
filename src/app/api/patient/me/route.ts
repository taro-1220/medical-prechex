import { NextResponse } from "next/server";
import type { PatientMeResponse } from "@/lib/types";

// Phase1: no patient auth yet. This endpoint returns fixed dummy data
// shaped exactly like the future real response so the page component
// does not need to change when Phase2 auth lands.
//
// TODO: Supabase Auth / LINE Login / Email OTP (see src/lib/patient-auth.ts)
// TODO: once user_id is available, resolve the patient via
//       `patients.user_id = auth.uid()` and query real appointments/consent_logs
//       via src/lib/store.ts instead of returning this dummy payload.
export async function GET() {
  const data: PatientMeResponse = {
    patient: {
      id: "dummy-patient-id",
      name: "山田 太郎",
      phone: "090-1234-5678",
      email: "yamada@example.com",
    },
    nextAppointment: {
      id: "dummy-appt-next",
      token: "dummy-token-next",
      clinicName: "medipre歯科クリニック",
      patientName: "山田 太郎",
      phone: "090-1234-5678",
      email: "yamada@example.com",
      communicationChannel: "email",
      appointmentAt: "2026-07-15T10:00:00+09:00",
      description: "定期検診",
      cancellationPolicy: "前日18時までのキャンセルは無料です。",
      status: "ticket_issued",
      createdAt: "2026-07-01T09:00:00+09:00",
      treatmentCategory: "other",
      cancelPolicyApplied: false,
      baseAmount: null,
      cardRegistrationRequired: false,
      chargeStatus: "none",
      chargedAmount: null,
    },
    appointmentHistory: [
      {
        id: "dummy-appt-1",
        token: "dummy-token-1",
        clinicName: "medipre歯科クリニック",
        patientName: "山田 太郎",
        phone: "090-1234-5678",
        email: "yamada@example.com",
        communicationChannel: "email",
        appointmentAt: "2026-05-10T14:00:00+09:00",
        description: "初診・カウンセリング",
        cancellationPolicy: "前日18時までのキャンセルは無料です。",
        status: "completed",
        createdAt: "2026-05-01T09:00:00+09:00",
        treatmentCategory: "other",
        cancelPolicyApplied: false,
        baseAmount: null,
        cardRegistrationRequired: false,
        chargeStatus: "none",
        chargedAmount: null,
      },
    ],
    consentHistory: [
      { clinicName: "medipre歯科クリニック", consentedAt: "2026-05-01T09:10:00+09:00" },
    ],
  };

  return NextResponse.json(data);
}
