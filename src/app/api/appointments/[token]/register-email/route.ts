import { NextRequest, NextResponse } from "next/server";
import { getAppointment } from "@/lib/store";
import { isValidEmailFormat } from "@/lib/contact-info";
import { savePatientRegisteredEmail } from "@/lib/patient-email-store";
import { isEmailSendEnabled, sendEmailRegisteredNotice } from "@/lib/notify-email";
import { isIdentityVerified } from "@/lib/identity-check";
import { determineConfirmState, canWrite } from "@/lib/confirm-state";

// 患者自身による、前日リマインド受取用メールの登録・変更・解除。トークンで対象を特定する
// （既存の確認画面API群と同じ検証）。確認用トークンはログ・エラー文に出さない。
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!isIdentityVerified(req, token)) {
      return NextResponse.json({ error: "identity_verification_required" }, { status: 401 });
    }
    const appt = await getAppointment(token);
    if (!appt) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const state = determineConfirmState(appt.status, appt.appointmentAt, new Date().toISOString());
    if (!canWrite(state)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.email === "string" ? body.email.trim() : "";
    const email = raw.length > 0 ? raw : null;
    if (email && !isValidEmailFormat(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }

    const result = await savePatientRegisteredEmail(appt.id, email);
    if (!result.ok) {
      if (result.reason === "rate_limited") return NextResponse.json({ error: "rate_limited" }, { status: 429 });
      if (result.reason === "unsupported") return NextResponse.json({ error: "not_supported" }, { status: 503 });
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (email && process.env.ENABLE_REMINDER_SEND === "true" && isEmailSendEnabled()) {
      await sendEmailRegisteredNotice({
        to: email,
        clinicName: appt.clinicName,
        clinicPhone: appt.clinicPhone ?? "",
        appointmentAt: appt.appointmentAt,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
