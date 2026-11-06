import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authenticateRequest, authorizeClinicAccess, getActiveClinicIdsForUser } from "@/lib/clinic-access";
import { createAppointment, getAllAppointments } from "@/lib/store";
import { isValidEmailFormat } from "@/lib/contact-info";
import { sendConfirmationEmailAndRecord } from "@/lib/confirm-email";

function safeError(e: unknown) {
  const err = e instanceof Error ? e : new Error(String(e));
  return { debugMessage: err.message };
}

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 患者情報を返すため、view 権限があり承認済み(active)の所属医院のみを対象にする
  const scope = await getActiveClinicIdsForUser(user.id);
  if (!scope.ok) return scope.response;
  if (scope.blocked) return NextResponse.json({ error: "Forbidden: clinic not approved" }, { status: 403 });
  const clinicIds = scope.clinicIds;

  try {
    return NextResponse.json(await getAllAppointments(clinicIds));
  } catch (e) {
    return NextResponse.json({ error: "internal_error", ...safeError(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authToken = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!authToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(authToken);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 操作可能な clinic_id は所属(clinic_users)からのみ確定する（クライアント入力を信用しない）
  const { data: cu, error: cuErr } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id, selected")
    .eq("user_id", user.id);
  if (cuErr) return NextResponse.json({ error: cuErr.message }, { status: 500 });
  const memberships = cu ?? [];
  const clinicIds = memberships.map(r => r.clinic_id as string);
  if (clinicIds.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  // 必須入力の検証
  const patientName = typeof body?.patientName === "string" ? body.patientName.trim() : "";
  const appointmentAt = typeof body?.appointmentAt === "string" ? body.appointmentAt.trim() : "";
  if (!patientName || !appointmentAt) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (email && !isValidEmailFormat(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const treatmentCategory = ["insurance", "private", "other"].includes(body?.treatmentCategory)
    ? body.treatmentCategory
    : "other";
  const cancelPolicyManualOverride = typeof body?.cancelPolicyManualOverride === "boolean"
    ? body.cancelPolicyManualOverride
    : null;
  const cardRegistrationRequired = Boolean(body?.cardRegistrationRequired);
  const baseAmount = cardRegistrationRequired && typeof body?.baseAmount === "number" && body.baseAmount >= 0
    ? Math.floor(body.baseAmount)
    : null;
  if (cardRegistrationRequired && baseAmount === null) {
    return NextResponse.json({ error: "base_amount required when card_registration_required" }, { status: 400 });
  }

  // clinic_id の確定: 指定があれば所属チェック、無ければ selected(なければ先頭)を採用
  const requestedClinicId = (body?.clinicId ?? body?.clinic_id) as string | undefined;
  let clinicId: string;
  if (requestedClinicId) {
    if (!clinicIds.includes(requestedClinicId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    clinicId = requestedClinicId;
  } else {
    const selected = memberships.find(r => r.selected)?.clinic_id as string | undefined;
    clinicId = selected ?? clinicIds[0];
  }

  // 予約作成は owner/manager のみ。承認制(Phase P1): 未承認(pending_approval)・却下(rejected)の医院は不可
  const access = await authorizeClinicAccess(user, clinicId, "reservation", { requireActive: true });
  if (!access.ok) return access.response;

  // patientId 指定時は、その患者が認可済み clinic に属することを検証（他院患者の再利用を防ぐ）
  if (body?.patientId) {
    const { data: p, error: pErr } = await getSupabase()
      .from("patients")
      .select("id")
      .eq("id", body.patientId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    if (!p) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const appt = await createAppointment(
      { ...body, patientName, appointmentAt, treatmentCategory, cancelPolicyManualOverride, cardRegistrationRequired, baseAmount },
      clinicId,
    );

    const emailResult = await sendConfirmationEmailAndRecord(appt).catch(() => ({ ok: false, reason: "send_failed" }) as const);
    const responseAppt = emailResult.ok ? { ...appt, emailSentAt: emailResult.sentAt } : appt;

    return NextResponse.json({ ...responseAppt, emailSendStatus: emailResult.ok ? "sent" : emailResult.reason }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "internal_error", ...safeError(e) }, { status: 500 });
  }
}
