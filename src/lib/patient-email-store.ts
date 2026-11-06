// 患者が確認画面から自ら登録する、前日リマインド受取用メール（appointments.patient_registered_email）の
// 読み書き。migration 024未適用（列不存在=42703）の間は安全側で「未対応」を返す。
import { getSupabase } from "./supabase";

export type SavePatientEmailResult =
  | { ok: true }
  | { ok: false; reason: "rate_limited" | "unsupported" | "error"; detail?: string };

const RATE_LIMIT_MS = 60_000;

/** email=null で登録解除。簡易な回数制限（直前の保存から60秒未満は拒否。専用の仕組みが無いため） */
export async function savePatientRegisteredEmail(appointmentId: string, email: string | null): Promise<SavePatientEmailResult> {
  const sb = getSupabase();

  const { data: current, error: readErr } = await sb
    .from("appointments")
    .select("patient_registered_email_at")
    .eq("id", appointmentId)
    .maybeSingle();
  if (readErr) {
    if (readErr.code === "42703") return { ok: false, reason: "unsupported" };
    return { ok: false, reason: "error", detail: readErr.message };
  }
  const lastAt = current?.patient_registered_email_at as string | null | undefined;
  if (lastAt && Date.now() - new Date(lastAt).getTime() < RATE_LIMIT_MS) {
    return { ok: false, reason: "rate_limited" };
  }

  const { error } = await sb
    .from("appointments")
    .update({ patient_registered_email: email, patient_registered_email_at: new Date().toISOString() })
    .eq("id", appointmentId);
  if (error) {
    if (error.code === "42703") return { ok: false, reason: "unsupported" };
    return { ok: false, reason: "error", detail: error.message };
  }
  return { ok: true };
}
