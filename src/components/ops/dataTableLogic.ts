/**
 * DataTableのロジック部分（検索・絞り込み・並べ替え）。JSXを持たない純粋関数として
 * 切り出し、テスト容易性を確保する（.tsx経由のテストはesbuildのJSX変換で問題が
 * 起きるため、この方式に揃える）。
 */

export type SortDirection = "asc" | "desc";

/** クエリが空、またはsearchPredicateが無ければ全件そのまま返す。 */
export function filterBySearch<T>(
  rows: T[],
  query: string,
  searchPredicate?: (row: T, q: string) => boolean,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q || !searchPredicate) return rows;
  return rows.filter((row) => searchPredicate(row, q));
}

/** sortValueが無ければ元の順序のまま返す。元の配列は書き換えない。 */
export function sortRows<T>(
  rows: T[],
  sortValue: ((row: T) => string | number) | undefined,
  direction: SortDirection,
): T[] {
  if (!sortValue) return rows;
  const sorted = [...rows].sort((a, b) => {
    const av = sortValue(a);
    const bv = sortValue(b);
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  });
  return direction === "desc" ? sorted.reverse() : sorted;
}

/** 絞り込み→検索→並べ替えの順に適用する。 */
export function applyDataTableQuery<T>(
  rows: T[],
  options: {
    filterPredicate?: (row: T) => boolean;
    query?: string;
    searchPredicate?: (row: T, q: string) => boolean;
    sortValue?: (row: T) => string | number;
    sortDirection?: SortDirection;
  },
): T[] {
  let result = rows;
  if (options.filterPredicate) result = result.filter(options.filterPredicate);
  result = filterBySearch(result, options.query ?? "", options.searchPredicate);
  if (options.sortValue) result = sortRows(result, options.sortValue, options.sortDirection ?? "asc");
  return result;
}
