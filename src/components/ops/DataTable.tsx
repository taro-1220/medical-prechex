"use client";
import { useMemo, useState } from "react";
import { applyDataTableQuery, type SortDirection } from "./dataTableLogic";

export type DataTableColumn<T> = {
  key: string;
  label: string;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
};

export type DataTableFilterOption<T> = {
  value: string;
  label: string;
  predicate: (row: T) => boolean;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  searchPredicate?: (row: T, q: string) => boolean;
  filterOptions?: DataTableFilterOption<T>[];
  emptyMessage?: string;
  /** 既存の見た目（列数に応じた最小幅）を維持するためのクラス。例："min-w-[900px]" */
  minWidthClassName?: string;
};

/**
 * 運営者向け画面共通の表部品。検索・状態の絞り込み・並べ替え・空のときの表示を
 * ひとつの部品にまとめ、どの画面でも同じ位置・同じ挙動になるようにする。
 * 画面固有の要素（承認・却下ボタン等）は、列定義のrenderにJSXを差し込む形で対応する。
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  searchPlaceholder,
  searchPredicate,
  filterOptions,
  emptyMessage = "該当するデータがありません",
  minWidthClassName,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>(filterOptions?.[0]?.value ?? "");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const currentFilter = filterOptions?.find((f) => f.value === activeFilter);
  const sortColumn = columns.find((c) => c.key === sortKey && c.sortable);

  const visibleRows = useMemo(
    () =>
      applyDataTableQuery(rows, {
        filterPredicate: currentFilter?.predicate,
        query,
        searchPredicate,
        sortValue: sortColumn?.sortValue,
        sortDirection,
      }),
    [rows, currentFilter, query, searchPredicate, sortColumn, sortDirection],
  );

  const handleHeaderClick = (column: DataTableColumn<T>) => {
    if (!column.sortable) return;
    if (sortKey === column.key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(column.key);
      setSortDirection("asc");
    }
  };

  return (
    <div>
      {(searchPredicate || filterOptions) && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          {searchPredicate && (
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-teal-500"
            />
          )}
          {filterOptions && (
            <div className="flex gap-1 flex-wrap">
              {filterOptions.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setActiveFilter(f.value)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold transition ${
                    activeFilter === f.value
                      ? "bg-teal-600 text-white"
                      : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        <table className={`w-full text-sm ${minWidthClassName ?? ""}`}>
          <thead>
            <tr className="border-b border-gray-100">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleHeaderClick(col)}
                  className={`px-4 py-3 text-left text-xs font-bold text-gray-400 whitespace-nowrap ${
                    col.sortable ? "cursor-pointer select-none hover:text-gray-600" : ""
                  } ${col.headerClassName ?? ""}`}
                >
                  {col.label}
                  {col.sortable && sortKey === col.key && (sortDirection === "asc" ? " ▲" : " ▼")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-gray-50 hover:bg-gray-50 transition">
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 ${col.cellClassName ?? ""}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-400 text-sm">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
