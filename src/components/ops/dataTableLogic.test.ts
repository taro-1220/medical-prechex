// DataTableのロジック部分（検索・絞り込み・並べ替え）を、JSXなしの純粋関数として検証する。
import { describe, it, expect } from "vitest";
import { filterBySearch, sortRows, applyDataTableQuery } from "./dataTableLogic";

type Row = { id: string; name: string; slug: string | null; count: number };

const ROWS: Row[] = [
  { id: "1", name: "みどり歯科クリニック", slug: "midori", count: 3 },
  { id: "2", name: "はな歯科クリニック", slug: null, count: 1 },
  { id: "3", name: "うめ医院", slug: "ume", count: 2 },
];

const SEARCH_PREDICATE = (row: Row, q: string) =>
  row.name.toLowerCase().includes(q) || (row.slug?.toLowerCase().includes(q) ?? false);

describe("filterBySearch", () => {
  it("クエリが空なら全件そのまま返す", () => {
    expect(filterBySearch(ROWS, "", SEARCH_PREDICATE)).toEqual(ROWS);
  });

  it("名前の部分一致で絞り込む", () => {
    const result = filterBySearch(ROWS, "歯科", SEARCH_PREDICATE);
    expect(result.map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("slugの部分一致でも絞り込める", () => {
    const result = filterBySearch(ROWS, "ume", SEARCH_PREDICATE);
    expect(result.map((r) => r.id)).toEqual(["3"]);
  });

  it("該当なしなら空配列", () => {
    expect(filterBySearch(ROWS, "存在しない", SEARCH_PREDICATE)).toEqual([]);
  });
});

describe("sortRows", () => {
  it("sortValueが無ければ元の順序のまま", () => {
    expect(sortRows(ROWS, undefined, "asc")).toEqual(ROWS);
  });

  it("昇順に並べ替える", () => {
    const result = sortRows(ROWS, (r) => r.count, "asc");
    expect(result.map((r) => r.id)).toEqual(["2", "3", "1"]);
  });

  it("降順に並べ替える", () => {
    const result = sortRows(ROWS, (r) => r.count, "desc");
    expect(result.map((r) => r.id)).toEqual(["1", "3", "2"]);
  });

  it("元の配列を書き換えない", () => {
    const copy = [...ROWS];
    sortRows(ROWS, (r) => r.count, "desc");
    expect(ROWS).toEqual(copy);
  });
});

describe("applyDataTableQuery: 絞り込み→検索→並べ替えの順に適用する", () => {
  it("絞り込み・検索・並べ替えを組み合わせて適用できる", () => {
    const result = applyDataTableQuery(ROWS, {
      filterPredicate: (r) => r.slug !== null,
      query: "",
      searchPredicate: SEARCH_PREDICATE,
      sortValue: (r) => r.count,
      sortDirection: "asc",
    });
    expect(result.map((r) => r.id)).toEqual(["3", "1"]);
  });

  it("何も指定しなければ全件そのまま", () => {
    expect(applyDataTableQuery(ROWS, {})).toEqual(ROWS);
  });
});
