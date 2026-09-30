import type { Clinic } from "./types";

export type ClinicGuardResult = "login" | "no-clinic" | "ok";

/**
 * /clinic配下の各画面で共通のクリニック入室判定。
 * アクセストークンが無い（未ログイン・セッション切れ）なら"login"（/loginへ）、
 * 認証済みでもクリニックに未割当なら"no-clinic"（/loginではなく/clinicへ。
 * /clinic側の既存ガードが「クリニックが無ければ/clinic/create」を処理する）、
 * クリニックがあれば"ok"。
 */
export function resolveClinicGuard(
  accessToken: string | null,
  clinic: Clinic | null,
): ClinicGuardResult {
  if (!accessToken) return "login";
  if (!clinic) return "no-clinic";
  return "ok";
}
