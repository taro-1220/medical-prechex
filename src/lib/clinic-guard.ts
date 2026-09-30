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

/** resolveClinicGuardの結果に加え、判定がまだ終わっていない状態("checking")を持つ。 */
export type ClinicGuardViewState = ClinicGuardResult | "checking";

/**
 * 画面の中身を描画してよいか。"ok"（クリニックあり）のときだけtrue。
 * "checking"（判定中）、"login"/"no-clinic"（遷移中）では、枠や文字を含め
 * 一切描画しない（呼び出し側は背景だけの最小限の表示にする）。
 */
export function shouldRenderClinicContent(state: ClinicGuardViewState): boolean {
  return state === "ok";
}
