// MVP+2: Stripe Connect状態・カード登録・課金結果・charge_events のDBアクセス
import { getSupabase } from "./supabase";
import { toAppt } from "./store";
import { computeChargeDashboard, type ChargeDashboard } from "./dashboard";
import type {
  StripeAccountStatus,
  ChargeStatus,
  ChargeEvent,
  ChargeEventType,
  ChargeEventActor,
  ChargeFailureKind,
  Appointment,
} from "./types";

export async function getClinicStripeAccount(clinicId: string): Promise<{ stripeAccountId: string | null; stripeAccountStatus: StripeAccountStatus }> {
  const { data, error } = await getSupabase()
    .from("clinic_profile")
    .select("stripe_account_id, stripe_account_status")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    stripeAccountId: (data?.stripe_account_id as string | null) ?? null,
    stripeAccountStatus: (data?.stripe_account_status as StripeAccountStatus | undefined) ?? "not_connected",
  };
}

export async function upsertClinicStripeAccount(
  clinicId: string,
  fields: { stripeAccountId?: string; stripeAccountStatus?: StripeAccountStatus },
): Promise<void> {
  const patch: Record<string, unknown> = { clinic_id: clinicId };
  if (fields.stripeAccountId !== undefined) patch.stripe_account_id = fields.stripeAccountId;
  if (fields.stripeAccountStatus !== undefined) patch.stripe_account_status = fields.stripeAccountStatus;
  const { error } = await getSupabase().from("clinic_profile").upsert(patch, { onConflict: "clinic_id" });
  if (error) throw new Error(error.message);
}

export async function recordSetupIntent(token: string, setupIntentId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("appointments")
    .update({ stripe_setup_intent_id: setupIntentId })
    .eq("token", token);
  if (error) throw new Error(error.message);
}

export async function recordPaymentMethod(token: string, paymentMethodId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("appointments")
    .update({ stripe_payment_method_id: paymentMethodId })
    .eq("token", token);
  if (error) throw new Error(error.message);
}

export interface ChargeResultPatch {
  stripePaymentIntentId?: string;
  chargeStatus: ChargeStatus;
  chargedAmount?: number | null;
  chargeExecutedAt?: string;
}

export async function recordChargeResult(appointmentId: string, patch: ChargeResultPatch): Promise<void> {
  const row: Record<string, unknown> = { charge_status: patch.chargeStatus };
  if (patch.stripePaymentIntentId !== undefined) row.stripe_payment_intent_id = patch.stripePaymentIntentId;
  if (patch.chargedAmount !== undefined) row.charged_amount = patch.chargedAmount;
  if (patch.chargeExecutedAt !== undefined) row.charge_executed_at = patch.chargeExecutedAt;
  const { error } = await getSupabase().from("appointments").update(row).eq("id", appointmentId);
  if (error) throw new Error(error.message);
}

export interface InsertChargeEventInput {
  appointmentId: string;
  clinicId: string;
  eventType: ChargeEventType;
  amount?: number | null;
  stripeReferenceId?: string | null;
  actor: ChargeEventActor;
  dryRun: boolean;
  detail?: string | null;
  /** Phase K: event_type='failure'のときのみ意味を持つ（それ以外はnullのまま挿入すること） */
  failureKind?: ChargeFailureKind | null;
}

export async function insertChargeEvent(input: InsertChargeEventInput): Promise<void> {
  const { error } = await getSupabase().from("charge_events").insert({
    appointment_id: input.appointmentId,
    clinic_id: input.clinicId,
    event_type: input.eventType,
    amount: input.amount ?? null,
    stripe_reference_id: input.stripeReferenceId ?? null,
    actor: input.actor,
    dry_run: input.dryRun,
    detail: input.detail ?? null,
    failure_kind: input.failureKind ?? null,
  });
  if (error) throw new Error(error.message);
}

function toChargeEvent(row: Record<string, unknown>): ChargeEvent {
  return {
    id: row.id as string,
    appointmentId: row.appointment_id as string,
    clinicId: row.clinic_id as string,
    eventType: row.event_type as ChargeEventType,
    amount: (row.amount as number | null) ?? null,
    stripeReferenceId: (row.stripe_reference_id as string | null) ?? null,
    actor: row.actor as ChargeEventActor,
    dryRun: row.dry_run as boolean,
    detail: (row.detail as string | null) ?? null,
    failureKind: (row.failure_kind as ChargeFailureKind | null | undefined) ?? null,
    createdAt: row.created_at as string,
  };
}

export interface ExistingCharge {
  amount: number;
  chargedAt: string;
}

/**
 * Phase J セクション0: この予約に既に実課金（event_type='charge' かつ dry_run=false）の記録が
 * あるか。ドライラン記録・failureイベントは対象外（failureは再試行を妨げないため）。
 * 複数件あれば最新のものを返す。
 */
export async function findSuccessfulChargeEvent(appointmentId: string): Promise<ExistingCharge | null> {
  const { data, error } = await getSupabase()
    .from("charge_events")
    .select("amount, created_at")
    .eq("appointment_id", appointmentId)
    .eq("event_type", "charge")
    .eq("dry_run", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { amount: (data.amount as number | null) ?? 0, chargedAt: data.created_at as string };
}

export async function getChargeEventsForAppointment(appointmentId: string): Promise<ChargeEvent[]> {
  const { data, error } = await getSupabase()
    .from("charge_events")
    .select("*")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toChargeEvent);
}

export async function getChargeEventsForClinic(clinicId: string, sinceIso: string): Promise<ChargeEvent[]> {
  const { data, error } = await getSupabase()
    .from("charge_events")
    .select("*")
    .eq("clinic_id", clinicId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toChargeEvent);
}

/**
 * 無断判定の候補（E-2）: 予約日の翌日0時（JST）を過ぎ、来院記録が無く、
 * キャンセル未記録（キャンセル申出も含む）、charge_status='none' の確定済み予約。
 * 「医院設定の猶予」は今回は固定値（当日終了時=翌日0時）とし、可変設定は未実装（Phase Fで報告）。
 */
export async function findNoShowCandidates(clinicIds: string[], nowIso: string): Promise<Appointment[]> {
  if (clinicIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("appointments")
    .select("*")
    .in("clinic_id", clinicIds)
    .in("status", ["confirmed", "ticket_issued"])
    .eq("cancel_policy_applied", true)
    .eq("charge_status", "none")
    .is("cancelled_at", null)
    .is("cancel_requested_at", null)
    .lt("appointment_at", nowIso);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toAppt);
}

/** 課金失敗のうち、まだ本日リトライしていないもの（E-3） */
export async function findFailedChargesForRetry(clinicIds: string[]): Promise<Appointment[]> {
  if (clinicIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("appointments")
    .select("*")
    .in("clinic_id", clinicIds)
    .eq("charge_status", "failed");
  if (error) throw new Error(error.message);
  return (data ?? []).map(toAppt);
}

/** C-5ダッシュボード。monthStart/monthEndはISO日時（[monthStart, monthEnd)で予約日時を絞る） */
export async function getClinicChargeDashboard(
  clinicId: string,
  monthStart: string,
  monthEnd: string,
): Promise<ChargeDashboard> {
  const sb = getSupabase();
  const { data: apptRows, error: apptErr } = await sb
    .from("appointments")
    .select("*")
    .eq("clinic_id", clinicId)
    .gte("appointment_at", monthStart)
    .lt("appointment_at", monthEnd);
  if (apptErr) throw new Error(apptErr.message);

  const { data: eventRows, error: eventErr } = await sb
    .from("charge_events")
    .select("*")
    .eq("clinic_id", clinicId)
    .gte("created_at", monthStart)
    .lt("created_at", monthEnd);
  if (eventErr) throw new Error(eventErr.message);

  return computeChargeDashboard((apptRows ?? []).map(toAppt), (eventRows ?? []).map(toChargeEvent));
}
