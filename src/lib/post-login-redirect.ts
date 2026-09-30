import { isSafeRedirectPath } from "./clinic-auth";

export type OpsMeResult = { isOpsAdmin: boolean } | null;

/**
 * ログイン成功後の遷移先を決める純粋関数。
 * next が安全な値ならそれを最優先で使う。next が無い（または安全でない）ときのみ、
 * /api/ops/me の結果を見て /ops か /clinic かを決める。呼び出し失敗（null）は /clinic。
 */
export function resolvePostLoginPath(
  next: string | null | undefined,
  opsMeResult: OpsMeResult,
): string {
  if (isSafeRedirectPath(next)) return next;
  return opsMeResult?.isOpsAdmin ? "/ops" : "/clinic";
}
