// StatsCards.tsx から分離（.tsx はJSXを含み、tsconfigのjsx:"preserve"によりvitestがそのまま
// importすると構文解析に失敗するため、純関数はJSXを含まないこのファイルに置く）。
import type { StatusFilter } from "@/lib/clinic-appointments-view";

export type StatsCardsActive = "today" | StatusFilter | null;

/** URLクエリ（range・status）から、カードのactive判定を導く純関数 */
export function activeFromQuery(range: string | null, status: string | null): StatsCardsActive {
  const STATUS_VALUES: StatusFilter[] = ["pending", "confirmed", "visited", "canceled"];
  const validStatus = status && (STATUS_VALUES as string[]).includes(status) ? (status as StatusFilter) : null;
  if (validStatus) return validStatus;
  if (range === "today") return "today";
  return null;
}
