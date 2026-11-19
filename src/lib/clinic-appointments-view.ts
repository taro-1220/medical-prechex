// 予約ページ（/clinic/appointments）向けの、副作用の無い日付・絞り込み純関数。
// JST暦日の算出は既存の toJstDateKey（charge-policy.ts）を再利用する。
import { toJstDateKey } from "./charge-policy";
import { determineConfirmState } from "./confirm-state";
import type { Appointment, AppointmentStatus } from "./types";

export { toJstDateKey };

export type PeriodRange = "today" | "upcoming" | "past" | "all";
export type StatusFilter = "pending" | "confirmed" | "visited" | "canceled";

export const STATUS_FILTERS: StatusFilter[] = ["pending", "confirmed", "visited", "canceled"];

/** /clinic の集計カードと同じ定義（pending/confirmed/visited/canceled 以外の status は対象外） */
export function matchesStatus(status: AppointmentStatus, filter: StatusFilter | null | undefined): boolean {
  if (!filter) return true;
  switch (filter) {
    case "pending": return status === "confirmation_pending";
    case "confirmed": return status === "confirmed" || status === "ticket_issued";
    case "visited": return status === "checked_in";
    case "canceled": return status === "cancelled" || status === "expired";
    default: return false;
  }
}

export function isTodayJst(appointmentAtIso: string, nowIso: string): boolean {
  return toJstDateKey(appointmentAtIso) === toJstDateKey(nowIso);
}

/**
 * 未同意（confirmation_pending）のまま予約時刻を過ぎた予約か。DBのstatusは変更せず、
 * 表示上「期限切れ」として扱うための判定（confirm-state.tsのpast_pendingを流用）。
 */
export function isExpiredUnconfirmed(status: AppointmentStatus, appointmentAt: string, nowIso: string): boolean {
  return determineConfirmState(status, appointmentAt, nowIso) === "past_pending";
}

/**
 * 来院受付（スタッフ画面）で、予約日より前に来院したか（JST暦日で比較）。
 * 受付の許可・拒否は変えない。表示用の警告にのみ使う。
 */
export function isEarlyCheckin(appointmentAt: string, nowIso: string): boolean {
  return toJstDateKey(appointmentAt) > toJstDateKey(nowIso);
}

/**
 * 予約日より前（JST暦日）に受付済みになったか（前倒し来院）。
 * isEarlyCheckin と同じ判定軸を、受付時刻（checkedInAt）を基準に見たもの。
 * 受付後に診察完了(completed)へ進んでも checkedInAt は残るため、completed でも前倒し扱いは維持される。
 */
export function isPrecheckinVisit(appointmentAt: string, checkedInAt: string | null | undefined): boolean {
  return !!checkedInAt && isEarlyCheckin(appointmentAt, checkedInAt);
}

/** 一覧表示に使う「表示上の日付」。前倒し来院なら受付日時、それ以外は予約日時 */
export function displayDateIso(appointmentAt: string, checkedInAt: string | null | undefined): string {
  return isPrecheckinVisit(appointmentAt, checkedInAt) ? (checkedInAt as string) : appointmentAt;
}

export function matchesRange(appointmentAtIso: string, nowIso: string, range: PeriodRange): boolean {
  if (range === "all") return true;
  const apptKey = toJstDateKey(appointmentAtIso);
  const todayKey = toJstDateKey(nowIso);
  if (range === "today") return apptKey === todayKey;
  if (range === "upcoming") return apptKey > todayKey;
  return apptKey < todayKey; // past
}

export function filterAppointments(
  appointments: Appointment[],
  opts: { nowIso: string; range: PeriodRange; status?: StatusFilter | null },
): Appointment[] {
  return appointments.filter(
    (a) => matchesRange(a.appointmentAt, opts.nowIso, opts.range) && matchesStatus(a.status, opts.status),
  );
}

/** today・upcoming は時刻昇順、past・all は降順（/clinic 既存の並びと同じ比較軸） */
export function sortByRange(appointments: Appointment[], range: PeriodRange): Appointment[] {
  const ascending = range === "today" || range === "upcoming";
  return [...appointments].sort((a, b) => {
    const diff = new Date(a.appointmentAt).getTime() - new Date(b.appointmentAt).getTime();
    return ascending ? diff : -diff;
  });
}

export interface DateGroup {
  dateKey: string;
  items: Appointment[];
}

/** 渡された順序を保持したまま日付キーでグルーピングする（呼び出し側で sortByRange 済みであること） */
export function groupByDateJst(appointments: Appointment[]): DateGroup[] {
  const order: string[] = [];
  const map = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const key = toJstDateKey(a.appointmentAt);
    const arr = map.get(key);
    if (arr) {
      arr.push(a);
    } else {
      map.set(key, [a]);
      order.push(key);
    }
  }
  return order.map((dateKey) => ({ dateKey, items: map.get(dateKey)! }));
}

export interface CalendarDay {
  dateKey: string;
  inMonth: boolean;
  isToday: boolean;
  weekday: number; // 0=日 .. 6=土
}

function dateKeyOf(y: number, m0: number, d: number): string {
  const dt = new Date(Date.UTC(y, m0, d));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function weekdayOf(y: number, m0: number, d: number): number {
  return new Date(Date.UTC(y, m0, d)).getUTCDay();
}

/**
 * monthKey("YYYY-MM")の月を、日曜始まりの週配列で返す（前後月の日は inMonth:false）。
 * カレンダー専用の暦日演算（Date.UTCを実時刻ではなく日付計算にのみ使う。toJstDateKeyと同じ考え方）。
 */
export function buildMonthWeeks(monthKey: string, nowIso: string): CalendarDay[][] {
  const [y, m] = monthKey.split("-").map(Number);
  const m0 = m - 1;
  const daysInMonth = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  const firstWeekday = weekdayOf(y, m0, 1);
  const todayKey = toJstDateKey(nowIso);

  const cells: CalendarDay[] = [];
  for (let i = firstWeekday; i > 0; i--) {
    const dateKey = dateKeyOf(y, m0, 1 - i);
    cells.push({ dateKey, inMonth: false, isToday: dateKey === todayKey, weekday: weekdayOf(y, m0, 1 - i) });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = dateKeyOf(y, m0, day);
    cells.push({ dateKey, inMonth: true, isToday: dateKey === todayKey, weekday: weekdayOf(y, m0, day) });
  }
  let next = daysInMonth + 1;
  while (cells.length % 7 !== 0) {
    const dateKey = dateKeyOf(y, m0, next);
    cells.push({ dateKey, inMonth: false, isToday: dateKey === todayKey, weekday: weekdayOf(y, m0, next) });
    next++;
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export type StatusCounts = Record<StatusFilter, number>;

function emptyCounts(): StatusCounts {
  return { pending: 0, confirmed: 0, visited: 0, canceled: 0 };
}

/** JST暦日ごとの、状態別件数（pending/confirmed/visited/canceled のみ。completed等は対象外） */
export function countsByDateAndStatus(appointments: Appointment[]): Record<string, StatusCounts> {
  const result: Record<string, StatusCounts> = {};
  for (const a of appointments) {
    const key = toJstDateKey(a.appointmentAt);
    const counts = result[key] ?? (result[key] = emptyCounts());
    for (const f of STATUS_FILTERS) {
      if (matchesStatus(a.status, f)) counts[f]++;
    }
  }
  return result;
}

/** 来院済み（checked_in以降）の予約では、担当・備考を編集不可にする */
export function canEditHandoffFields(status: AppointmentStatus): boolean {
  return status !== "checked_in" && status !== "completed";
}

/** 受付（QR読み取り後）の「担当」表示。担当未設定時は登録者（取れれば）を添える */
export function staffDisplayLabel(staffNameSnapshot: string | undefined, createdByName: string | undefined): string {
  if (staffNameSnapshot) return staffNameSnapshot;
  return createdByName ? `担当未設定（登録：${createdByName}）` : "担当未設定";
}
