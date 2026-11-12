// 予約日時の表示を、画面・メールで共通化する（タイムゾーンのずれ対策）。
// すべての表示はこの関数を経由し、timeZone: "Asia/Tokyo" を明示する。

export function formatJstDateTime(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(iso).toLocaleString("ja-JP", { ...opts, timeZone: "Asia/Tokyo" });
}

/**
 * <input type="datetime-local"> の値（"YYYY-MM-DDTHH:mm"、タイムゾーン情報を含まない）を
 * 日本時間として明示したISO文字列に変換する。これをせずにそのままDB（timestamptz）へ渡すと、
 * セッションのタイムゾーン（JSTではない）で解釈され、時刻が実際とずれる。
 */
export function jstLocalInputToIso(localValue: string): string {
  return `${localValue}:00+09:00`;
}
