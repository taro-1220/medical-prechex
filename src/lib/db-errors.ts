// DBエラーコードの判定（純粋関数。Supabaseクライアントには依存しない）。

/**
 * 「列が存在しない」エラーだけを判定する。migration未適用の間だけ既存列で再試行する用途に使う。
 * PGRST204 = PostgRESTのスキーマキャッシュに列が無い、42703 = Postgresのundefined_column。
 * これ以外のエラー（制約違反・権限・接続等）は再試行してはいけない。
 */
export function isMissingColumnError(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "PGRST204" || error?.code === "42703";
}
