import { getSupabase } from "./supabase";
import type {
  Appointment,
  AppointmentStatus,
  Patient,
  PatientListItem,
  PatientConsentLog,
  PatientDetail,
  TreatmentCategory,
  CancelPolicyScope,
  ClinicCancelPolicySettings,
  CancelPolicy,
  CancelTier,
  StripeAccountStatus,
  ChargeStatus,
  ChargeEvent,
  ChargeEventType,
  ChargeEventActor,
} from "./types";
import { resolveCancelPolicyApplication } from "./cancel-policy";
import { TERMS_VERSION } from "./terms";

export function toAppt(row: Record<string, unknown>): Appointment {
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
    lineSentAt:           row.line_sent_at as string | undefined,
    smsSentAt:            row.sms_sent_at as string | undefined,
    emailSentAt:          row.email_sent_at as string | undefined,
    clinicId:             row.clinic_id as string | undefined,
    patientId:            row.patient_id as string | undefined,
    createdAt:            row.created_at as string,
    treatmentCategory:      row.treatment_category as TreatmentCategory,
    cancelPolicyApplied:    row.cancel_policy_applied as boolean,
    cancelPolicySnapshot:   row.cancel_policy_snapshot as string | undefined,
    cancelPolicyAgreedAt:   row.cancel_policy_agreed_at as string | undefined,
    cancelRequestedAt:      row.cancel_requested_at as string | undefined,
    baseAmount:             (row.base_amount as number | null) ?? null,
    cardRegistrationRequired: row.card_registration_required as boolean,
    stripeSetupIntentId:    row.stripe_setup_intent_id as string | undefined,
    stripePaymentMethodId:  row.stripe_payment_method_id as string | undefined,
    stripePaymentIntentId:  row.stripe_payment_intent_id as string | undefined,
    chargeStatus:           row.charge_status as Appointment["chargeStatus"],
    chargedAmount:          (row.charged_amount as number | null) ?? null,
    chargeExecutedAt:       row.charge_executed_at as string | undefined,
  };
}

export async function searchPatients(query: string, clinicIds: string[]): Promise<Patient[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  if (clinicIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("patients")
    .select("id, name, phone, email")
    .in("clinic_id", clinicIds)
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

// 医院スタッフ向け患者一覧。患者(自院)＋予約集計を2クエリで取得しJSで集約（N+1回避）
export async function getClinicPatients(clinicIds: string[], q?: string): Promise<PatientListItem[]> {
  if (clinicIds.length === 0) return [];
  const sb = getSupabase();

  let query = sb.from("patients").select("id, name, phone, email").in("clinic_id", clinicIds);
  const term = (q ?? "").trim();
  if (term.length >= 1) {
    query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
  }
  const { data: patients, error } = await query;
  if (error) throw new Error(error.message);
  const list = patients ?? [];
  if (list.length === 0) return [];

  const ids = list.map(p => p.id as string);
  const { data: appts, error: aErr } = await sb
    .from("appointments")
    .select("patient_id, appointment_at, status")
    .in("patient_id", ids)
    .in("clinic_id", clinicIds);
  if (aErr) throw new Error(aErr.message);

  const agg = new Map<string, { count: number; last: string | null; status: AppointmentStatus | null }>();
  for (const a of appts ?? []) {
    const pid = a.patient_id as string;
    const cur = agg.get(pid) ?? { count: 0, last: null, status: null };
    cur.count++;
    const at = a.appointment_at as string;
    if (cur.last === null || new Date(at).getTime() > new Date(cur.last).getTime()) {
      cur.last = at;
      cur.status = a.status as AppointmentStatus;
    }
    agg.set(pid, cur);
  }

  return list
    .map(p => {
      const g = agg.get(p.id as string);
      return {
        id:                p.id as string,
        name:              p.name as string,
        phone:             p.phone as string,
        email:             p.email as string,
        appointmentCount:  g?.count ?? 0,
        lastAppointmentAt: g?.last ?? null,
        latestStatus:      g?.status ?? null,
      };
    })
    .sort((a, b) => {
      const av = a.lastAppointmentAt ? new Date(a.lastAppointmentAt).getTime() : 0;
      const bv = b.lastAppointmentAt ? new Date(b.lastAppointmentAt).getTime() : 0;
      return bv - av;
    });
}

// 患者詳細。他院患者・不存在は null（呼び出し側で404化）。予約・同意は新しい順
export async function getClinicPatientDetail(patientId: string, clinicIds: string[]): Promise<PatientDetail | null> {
  if (clinicIds.length === 0) return null;
  const sb = getSupabase();

  const { data: p, error } = await sb
    .from("patients")
    .select("id, name, phone, email, clinic_id, user_id, created_at")
    .eq("id", patientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!p || !clinicIds.includes(p.clinic_id as string)) return null;
  const clinicId = p.clinic_id as string;

  const { data: apptRows, error: aErr } = await sb
    .from("appointments")
    .select("*")
    .eq("patient_id", patientId)
    .eq("clinic_id", clinicId)
    .order("appointment_at", { ascending: false });
  if (aErr) throw new Error(aErr.message);
  const appointments = (apptRows ?? []).map(toAppt);

  let consents: PatientConsentLog[] = [];
  const apptIds = appointments.map(a => a.id);
  if (apptIds.length > 0) {
    const { data: logs, error: cErr } = await sb
      .from("consent_logs")
      .select("id, appointment_id, consented_at, appointment_at, policy_text")
      .in("appointment_id", apptIds)
      .order("consented_at", { ascending: false });
    if (cErr) throw new Error(cErr.message);
    consents = (logs ?? []).map(l => ({
      id:            l.id as string,
      appointmentId: l.appointment_id as string,
      consentedAt:   l.consented_at as string,
      appointmentAt: l.appointment_at as string,
      policyText:    l.policy_text as string,
    }));
  }

  return {
    patient: {
      id:        p.id as string,
      name:      p.name as string,
      phone:     p.phone as string,
      email:     p.email as string,
      userId:    (p.user_id as string | null) ?? null,
      createdAt: p.created_at as string,
    },
    appointments,
    consents,
  };
}

export async function getAllAppointments(clinicIds: string[]): Promise<Appointment[]> {
  if (clinicIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("appointments")
    .select("*")
    .in("clinic_id", clinicIds)
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

/** 医院スタッフ向け。clinicIds所属チェックは呼び出し側で行う */
export async function getAppointmentById(id: string): Promise<Appointment | undefined> {
  const { data, error } = await getSupabase()
    .from("appointments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toAppt(data) : undefined;
}

/**
 * confirm/チケット画面向け。getAppointment に加え、DBカラムを持たない表示専用フィールド
 * （basis_note・医院電話番号・chargeFailureKind）を都度joinして返す。basis_note は
 * show_basis_to_patient=true の場合のみ載せる（内部の金額根拠メモを無条件に患者へ見せないため）
 */
export async function getAppointmentForDisplay(token: string): Promise<Appointment | undefined> {
  const appt = await getAppointment(token);
  if (!appt || !appt.clinicId) return appt;

  const sb = getSupabase();
  const { data: profile } = await sb
    .from("clinic_profile")
    .select("phone")
    .eq("clinic_id", appt.clinicId)
    .maybeSingle();
  let clinicPhone = (profile?.phone as string | undefined) || undefined;
  if (!clinicPhone) {
    const { data: clinic } = await sb.from("clinics").select("phone").eq("id", appt.clinicId).maybeSingle();
    clinicPhone = (clinic?.phone as string | undefined) || undefined;
  }

  // Phase K: chargeStatus='failed'のとき、患者表示の分岐（別カード導線 vs 医院連絡のみ）に使う
  let chargeFailureKind: "card_declined" | "system_error" | null = null;
  if (appt.chargeStatus === "failed") {
    const { data: failureEvent } = await sb
      .from("charge_events")
      .select("failure_kind")
      .eq("appointment_id", appt.id)
      .eq("event_type", "failure")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    chargeFailureKind = (failureEvent?.failure_kind as "card_declined" | "system_error" | null | undefined) ?? null;
  }

  if (appt.cancelPolicyApplied && (appt.treatmentCategory === "private" || appt.treatmentCategory === "insurance")) {
    const { data: policy } = await sb
      .from("clinic_cancel_policies")
      .select("basis_note, show_basis_to_patient, tiers")
      .eq("clinic_id", appt.clinicId)
      .eq("treatment_category", appt.treatmentCategory)
      .maybeSingle();
    return {
      ...appt,
      clinicPhone,
      chargeFailureKind,
      cancelPolicyShowBasisToPatient: (policy?.show_basis_to_patient as boolean | undefined) ?? false,
      cancelPolicyBasisNote: policy?.show_basis_to_patient ? (policy?.basis_note as string | undefined) : undefined,
      cancelPolicyTiers: (policy?.tiers as CancelTier[] | null | undefined) ?? null,
    };
  }

  return { ...appt, clinicPhone, chargeFailureKind };
}

async function findOrCreatePatient(
  patientName: string,
  phone: string,
  email: string,
  clinicId: string,
): Promise<string> {
  const sb = getSupabase();
  let existingId: string | null = null;
  // 患者照合は医院単位で行う（他院の同一電話/メール患者を跨いで共有しない）
  if (phone) {
    const { data } = await sb.from("patients").select("id").eq("clinic_id", clinicId).eq("phone", phone).maybeSingle();
    if (data) existingId = data.id as string;
  }
  if (!existingId && email) {
    const { data } = await sb.from("patients").select("id").eq("clinic_id", clinicId).eq("email", email).maybeSingle();
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
  input: Omit<Appointment, "id" | "token" | "status" | "createdAt"> & { cancelPolicyManualOverride?: boolean | null },
  clinicId: string,
): Promise<Appointment> {
  const sb = getSupabase();
  // clinic_name は認可済み clinicId から取得する（クライアント入力を表示名として信用しない）
  const { data: clinic } = await sb.from("clinics").select("name").eq("id", clinicId).maybeSingle();
  const clinicName = (clinic?.name as string | undefined) ?? input.clinicName;

  // patientId は API 層で clinicId 所属を検証済みのものだけが渡る想定。未指定なら医院単位で照合/作成
  const patientId = input.patientId ?? await findOrCreatePatient(input.patientName, input.phone ?? "", input.email ?? "", clinicId);

  const treatmentCategory: TreatmentCategory = input.treatmentCategory ?? "other";

  // Step MVP+1: 予約作成時点のキャンセル料ポリシー設定を snapshot する
  // （cancellation_policy と同じ「作成時点で凍結する」設計に揃える。同意時に医院側の設定が
  //   変わっていても、患者が確認画面で見た内容と同じものだけを同意ログへ残せるようにするため）
  const settings = await getClinicCancelPolicySettings(clinicId);
  const manualOverride = input.cancelPolicyManualOverride ?? null;
  const applied = resolveCancelPolicyApplication(
    { enabled: settings.enabled, scope: settings.scope },
    treatmentCategory,
    manualOverride,
  );
  const policyForCategory = treatmentCategory === "private" || treatmentCategory === "insurance"
    ? settings.policies[treatmentCategory]
    : null;
  const cancelPolicySnapshot = applied ? (policyForCategory?.policyText ?? "") : null;

  const { data, error } = await sb
    .from("appointments")
    .insert({
      token:                 crypto.randomUUID(),
      clinic_name:           clinicName,
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
      treatment_category:    treatmentCategory,
      cancel_policy_applied: applied,
      cancel_policy_snapshot: cancelPolicySnapshot,
      base_amount:           input.baseAmount ?? null,
      card_registration_required: input.cardRegistrationRequired ?? false,
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

  // MVP+1: 同意時点の適用条件（診療区分・医院設定scope）を consent_logs へ記録する。
  // policy_text自体のスナップショットは既存どおり appt.cancellationPolicy のみ（構造は変更しない）
  const settings = appt.clinicId ? await getClinicCancelPolicySettings(appt.clinicId) : null;

  // 2. consent_logs に先に insert（失敗時は appointments を更新しない）
  // Medipre利用規約への同意は、キャンセルポリシー適用有無に関わらず、確定操作そのものに
  // 常に伴うため（画面側チェックボックスは既存のcancelPolicyConsentedと同じ扱いのゲート）、
  // 条件分岐せず毎回記録する。
  const { error: logError } = await getSupabase()
    .from("consent_logs")
    .insert({
      appointment_id:     appt.id,
      token:              appt.token,
      policy_text:        appt.cancellationPolicy,
      consented_at:       consentAt,
      patient_name:       appt.patientName,
      appointment_at:     appt.appointmentAt,
      treatment_category: appt.treatmentCategory,
      policy_scope:       settings?.scope ?? null,
      terms_version:      TERMS_VERSION,
      terms_agreed_at:    consentAt,
    });
  if (logError) throw new Error(`consent_log insert failed: ${logError.message}`);

  // 3. consent_logs 保存成功後のみ appointments を confirmed に更新。
  //    キャンセル料ポリシー適用時は同意日時も記録する（本文は作成時点で既にsnapshot済み）
  const extra = appt.cancelPolicyApplied ? { consentAt, cancelPolicyAgreedAt: consentAt } : { consentAt };
  const ok = await updateStatus(token, "confirmed", extra);
  return ok;
}

/** ［キャンセルを申し出る］。金銭処理は行わず、医院側が予約一覧で気付けるよう記録するのみ */
export async function requestCancellation(token: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("appointments")
    .update({ cancel_requested_at: new Date().toISOString() })
    .eq("token", token)
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function updateStatus(
  token: string,
  status: AppointmentStatus,
  extra?: Partial<Appointment>
): Promise<boolean> {
  const patch: Record<string, unknown> = { status };
  if (extra?.consentAt)           patch.consent_at            = extra.consentAt;
  if (extra?.checkedInAt)         patch.checked_in_at         = extra.checkedInAt;
  if (extra?.cancelledAt)         patch.cancelled_at          = extra.cancelledAt;
  if (extra?.cancelPolicyAgreedAt) patch.cancel_policy_agreed_at = extra.cancelPolicyAgreedAt;

  const { data, error } = await getSupabase()
    .from("appointments")
    .update(patch)
    .eq("token", token)
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// MVP+1: キャンセル料ポリシー設定（clinic_profile拡張 + clinic_cancel_policies）
// ---------------------------------------------------------------------------

function toCancelPolicy(row: Record<string, unknown>): CancelPolicy {
  return {
    treatmentCategory:    row.treatment_category as "private" | "insurance",
    policyText:           row.policy_text as string,
    basisNote:            row.basis_note as string,
    showBasisToPatient:   row.show_basis_to_patient as boolean,
    graceHours:           row.grace_hours as number,
    tiers:                (row.tiers as CancelTier[] | null) ?? null,
  };
}

export async function getClinicCancelPolicySettings(clinicId: string): Promise<ClinicCancelPolicySettings> {
  const sb = getSupabase();
  const { data: profile, error: profErr } = await sb
    .from("clinic_profile")
    .select("cancel_policy_enabled, cancel_policy_scope, cancel_policy_insurance_acknowledged")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (profErr) throw new Error(profErr.message);

  const { data: policies, error: polErr } = await sb
    .from("clinic_cancel_policies")
    .select("*")
    .eq("clinic_id", clinicId);
  if (polErr) throw new Error(polErr.message);

  const byCategory = new Map((policies ?? []).map(p => [p.treatment_category as string, toCancelPolicy(p)]));

  return {
    enabled:               (profile?.cancel_policy_enabled as boolean | undefined) ?? false,
    scope:                 (profile?.cancel_policy_scope as CancelPolicyScope | null | undefined) ?? null,
    insuranceAcknowledged: (profile?.cancel_policy_insurance_acknowledged as boolean | undefined) ?? false,
    policies: {
      private:   byCategory.get("private") ?? null,
      insurance: byCategory.get("insurance") ?? null,
    },
  };
}

export interface UpsertCancelPolicyInput {
  enabled: boolean;
  scope: CancelPolicyScope | null;
  insuranceAcknowledged: boolean;
  policies: {
    private?: { policyText: string; basisNote: string; showBasisToPatient: boolean; graceHours: number; tiers: CancelTier[] | null };
    insurance?: { policyText: string; basisNote: string; showBasisToPatient: boolean; graceHours: number; tiers: CancelTier[] | null };
  };
}

export async function upsertClinicCancelPolicy(clinicId: string, input: UpsertCancelPolicyInput): Promise<void> {
  const sb = getSupabase();

  const { error: profErr } = await sb
    .from("clinic_profile")
    .upsert({
      clinic_id: clinicId,
      cancel_policy_enabled: input.enabled,
      cancel_policy_scope: input.scope,
      cancel_policy_insurance_acknowledged: input.insuranceAcknowledged,
    }, { onConflict: "clinic_id" });
  if (profErr) throw new Error(profErr.message);

  for (const category of ["private", "insurance"] as const) {
    const p = input.policies[category];
    if (!p) continue;
    const { error } = await sb
      .from("clinic_cancel_policies")
      .upsert({
        clinic_id: clinicId,
        treatment_category: category,
        policy_text: p.policyText,
        basis_note: p.basisNote,
        show_basis_to_patient: p.showBasisToPatient,
        grace_hours: p.graceHours,
        tiers: p.tiers,
      }, { onConflict: "clinic_id,treatment_category" });
    if (error) throw new Error(error.message);
  }
}
