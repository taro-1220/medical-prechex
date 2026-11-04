import { getSupabase } from "./supabase";
import type { ClinicStatus } from "./types";

/**
 * 医院の承認状態の変更は、必ずこの関数（DB 関数 ops_change_clinic_status）を通す。
 * 状態変更と監査記録は DB 側で同一トランザクション・行ロックで実行され、不正遷移・重複承認は拒否される。
 * 呼び出し側は事前に requireOpsAdmin で運営管理者を確認し、その user を actor として渡すこと。
 * （clinics.status の直接 UPDATE は migration 021 のトリガーで拒否される）
 */
export type ChangeClinicStatusResult =
  | { ok: true; action: "approve" | "reject" | "reapprove"; fromStatus: ClinicStatus; toStatus: ClinicStatus; eventId: string }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string };

export async function changeClinicStatus(params: {
  clinicId: string;
  toStatus: "active" | "rejected";
  actor: { id: string; email: string };
  reason?: string | null;
}): Promise<ChangeClinicStatusResult> {
  const { data, error } = await getSupabase().rpc("ops_change_clinic_status", {
    p_clinic_id: params.clinicId,
    p_to_status: params.toStatus,
    p_actor_user_id: params.actor.id,
    p_actor_email: params.actor.email,
    p_reason: params.reason ?? null,
  });

  if (error) {
    // errcode: P0002=対象なし / 55000=不正な状態遷移・重複 / 22023=入力不正（理由必須など）
    if (error.code === "P0002") return { ok: false, status: 404, error: "Not found" };
    if (error.code === "55000") return { ok: false, status: 409, error: "invalid_transition" };
    if (error.code === "22023") return { ok: false, status: 400, error: error.message || "invalid_request" };
    return { ok: false, status: 500, error: "internal_error" };
  }

  const r = data as {
    changed?: boolean; event_id?: string; action?: string; from_status?: string; to_status?: string;
  } | null;
  if (!r || r.changed !== true || !r.event_id || !r.action) {
    return { ok: false, status: 500, error: "internal_error" };
  }
  return {
    ok: true,
    action: r.action as "approve" | "reject" | "reapprove",
    fromStatus: r.from_status as ClinicStatus,
    toStatus: r.to_status as ClinicStatus,
    eventId: r.event_id,
  };
}

const MAX_REASON = 1000;

/** リクエスト本文から理由を取り出す（本文なし・不正 JSON は理由なし扱い）。 */
export async function readReason(req: Request): Promise<{ ok: true; reason: string | null } | { ok: false; error: string }> {
  let body: unknown = null;
  try { body = await req.json(); } catch { /* 本文なし */ }
  const raw = body && typeof body === "object" ? (body as { reason?: unknown }).reason : undefined;
  if (raw === undefined || raw === null) return { ok: true, reason: null };
  if (typeof raw !== "string") return { ok: false, error: "reason must be a string" };
  const reason = raw.trim();
  if (reason.length > MAX_REASON) return { ok: false, error: "reason_too_long" };
  return { ok: true, reason: reason || null };
}
