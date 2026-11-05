"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Appointment } from "@/lib/types";
import { getAccessToken } from "@/lib/clinic-auth";
import { useClinicGuard } from "@/lib/useClinicGuard";
import { shouldRenderClinicContent } from "@/lib/clinic-guard";
import {
  type PeriodRange,
  type StatusFilter,
  STATUS_FILTERS,
  filterAppointments,
  sortByRange,
  groupByDateJst,
  matchesStatus,
  matchesRange,
  buildMonthWeeks,
  countsByDateAndStatus,
  toJstDateKey,
} from "@/lib/clinic-appointments-view";
import { AppointmentRow } from "../AppointmentRow";

const RANGES: PeriodRange[] = ["today", "upcoming", "past", "all"];
const RANGE_LABEL: Record<PeriodRange, string> = { today: "今日", upcoming: "これから", past: "過去", all: "すべて" };
const STATUS_LABEL: Record<StatusFilter, string> = { pending: "確認待ち", confirmed: "確認済み", visited: "来院済み", canceled: "キャンセル" };
const STATUS_DOT: Record<StatusFilter, string> = { pending: "bg-yellow-500", confirmed: "bg-teal-500", visited: "bg-emerald-500", canceled: "bg-gray-400" };
const WEEKDAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"];

type ViewMode = "list" | "calendar";

function parseView(v: string | null): ViewMode {
  return v === "calendar" ? "calendar" : "list";
}
function parseRange(v: string | null): PeriodRange {
  return (RANGES as string[]).includes(v ?? "") ? (v as PeriodRange) : "today";
}
function parseStatus(v: string | null): StatusFilter | null {
  return (STATUS_FILTERS as string[]).includes(v ?? "") ? (v as StatusFilter) : null;
}
function parseDateKey(v: string | null): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
function parseMonthKey(v: string | null, fallback: string): string {
  return v && /^\d{4}-\d{2}$/.test(v) ? v : fallback;
}
function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}
function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function formatDateHeading(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const weekday = WEEKDAY_LABEL[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}（${weekday}）`;
}

function AppointmentsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state: guardState, clinic } = useClinicGuard(router);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const nowIso = new Date().toISOString();
  const todayKey = toJstDateKey(nowIso);

  const view = parseView(searchParams.get("view"));
  const range = parseRange(searchParams.get("range"));
  const status = parseStatus(searchParams.get("status"));
  const selectedDate = parseDateKey(searchParams.get("date"));
  const month = parseMonthKey(searchParams.get("month"), monthKeyOf(selectedDate ?? todayKey));

  const load = async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/appointments", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) { setAppointments([]); return; }
      const data = await res.json();
      setAppointments(Array.isArray(data) ? data : []);
    } catch {
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (guardState !== "ok" || !clinic) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardState, clinic]);

  const updateParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k); else next.set(k, v);
    }
    router.push(`/clinic/appointments?${next.toString()}`);
  };

  const rangeCounts = useMemo(() => {
    const c = { today: 0, upcoming: 0, past: 0, all: appointments.length } as Record<PeriodRange, number>;
    for (const r of ["today", "upcoming", "past"] as PeriodRange[]) {
      c[r] = appointments.filter((a) => matchesRange(a.appointmentAt, nowIso, r)).length;
    }
    return c;
  }, [appointments, nowIso]);

  const statusCounts = useMemo(() => {
    const base = filterAppointments(appointments, { nowIso, range });
    const c = { all: base.length, pending: 0, confirmed: 0, visited: 0, canceled: 0 } as Record<"all" | StatusFilter, number>;
    for (const f of STATUS_FILTERS) c[f] = base.filter((a) => matchesStatus(a.status, f)).length;
    return c;
  }, [appointments, nowIso, range]);

  const listItems = useMemo(
    () => sortByRange(filterAppointments(appointments, { nowIso, range, status }), range),
    [appointments, nowIso, range, status],
  );
  const groups = useMemo(() => groupByDateJst(listItems), [listItems]);

  const weeks = useMemo(() => buildMonthWeeks(month, nowIso), [month, nowIso]);
  const dayCounts = useMemo(() => countsByDateAndStatus(appointments), [appointments]);
  const selectedDayItems = useMemo(() => {
    if (!selectedDate) return [];
    return sortByRange(appointments.filter((a) => toJstDateKey(a.appointmentAt) === selectedDate), "today");
  }, [appointments, selectedDate]);

  if (!shouldRenderClinicContent(guardState)) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-4 sm:px-6 py-4">
        <Link href="/clinic" className="text-gray-400 text-sm hover:text-gray-900 transition">← 管理画面</Link>
        <div className="flex items-center justify-between mt-1 flex-wrap gap-3">
          <h1 className="text-xl font-black text-gray-900">予約</h1>
          <div role="tablist" aria-label="表示切り替え" className="inline-flex rounded-xl border border-gray-200 overflow-hidden">
            <button
              role="tab"
              aria-selected={view === "list"}
              onClick={() => updateParams({ view: "list" })}
              className={`min-h-[44px] px-4 text-sm font-bold transition ${view === "list" ? "bg-teal-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              リスト
            </button>
            <button
              role="tab"
              aria-selected={view === "calendar"}
              onClick={() => updateParams({ view: "calendar" })}
              className={`min-h-[44px] px-4 text-sm font-bold transition ${view === "calendar" ? "bg-teal-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              カレンダー
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {view === "list" ? (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1 mb-3" role="tablist" aria-label="期間">
              {RANGES.map((r) => (
                <button
                  key={r}
                  role="tab"
                  aria-selected={range === r}
                  onClick={() => updateParams({ range: r })}
                  className={`shrink-0 min-h-[44px] px-4 rounded-xl text-sm font-bold border transition ${
                    range === r ? "bg-teal-600 text-white border-teal-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {RANGE_LABEL[r]}（{rangeCounts[r]}）
                </button>
              ))}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 mb-6" role="group" aria-label="状態">
              <button
                onClick={() => updateParams({ status: null })}
                className={`shrink-0 min-h-[44px] px-3 rounded-full text-xs font-bold border transition ${
                  !status ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                すべて（{statusCounts.all}）
              </button>
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => updateParams({ status: status === f ? null : f })}
                  className={`shrink-0 min-h-[44px] px-3 rounded-full text-xs font-bold border transition ${
                    status === f ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {STATUS_LABEL[f]}（{statusCounts[f]}）
                </button>
              ))}
            </div>

            {loading ? (
              <p className="text-gray-400 text-sm">読み込み中...</p>
            ) : groups.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <p className="text-4xl mb-3">📋</p>
                <p>該当する予約はありません</p>
                <button
                  onClick={() => updateParams({ range: "all", status: null })}
                  className="mt-4 text-teal-600 text-sm hover:underline"
                >
                  条件を解除する
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {groups.map((g) => (
                  <div key={g.dateKey}>
                    <h2 className="text-sm font-bold text-gray-500 mb-2">{formatDateHeading(g.dateKey)}</h2>
                    <div className="space-y-3">
                      {g.items.map((a) => (
                        <AppointmentRow key={a.id} appointment={a} onChanged={load} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateParams({ month: shiftMonthKey(month, -1) })}
                  aria-label="前の月"
                  className="min-h-[44px] min-w-[44px] rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  ‹
                </button>
                <span className="font-bold">{month}</span>
                <button
                  onClick={() => updateParams({ month: shiftMonthKey(month, 1) })}
                  aria-label="次の月"
                  className="min-h-[44px] min-w-[44px] rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  ›
                </button>
              </div>
              <button
                onClick={() => updateParams({ month: monthKeyOf(todayKey), date: todayKey })}
                className="min-h-[44px] px-3 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
              >
                今日
              </button>
            </div>

            <div className="grid grid-cols-7 text-center text-xs font-bold mb-1">
              {WEEKDAY_LABEL.map((w, i) => (
                <div key={w} className={i === 0 ? "text-red-600" : i === 6 ? "text-blue-600" : "text-gray-500"}>
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weeks.flat().map((d) => {
                const counts = dayCounts[d.dateKey];
                return (
                  <button
                    key={d.dateKey}
                    onClick={() => updateParams({ date: d.dateKey, month: monthKeyOf(d.dateKey) })}
                    className={`min-h-[44px] rounded-lg border p-1 text-left transition ${
                      selectedDate === d.dateKey ? "border-teal-600 ring-2 ring-teal-200" : "border-gray-100 hover:bg-gray-50"
                    } ${!d.inMonth ? "opacity-40" : ""} ${d.isToday ? "bg-teal-50" : "bg-white"}`}
                  >
                    <div className={`text-xs ${d.weekday === 0 ? "text-red-600" : d.weekday === 6 ? "text-blue-600" : "text-gray-700"}`}>
                      {Number(d.dateKey.slice(8))}
                    </div>
                    {counts && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {STATUS_FILTERS.filter((f) => counts[f] > 0).map((f) => (
                          <span key={f} className="inline-flex items-center gap-0.5 text-[10px] text-gray-700">
                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[f]}`} />
                            {counts[f]}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-6">
              <h2 className="text-sm font-bold text-gray-500 mb-2">
                {selectedDate ? formatDateHeading(selectedDate) : "日付を選択してください"}
              </h2>
              {selectedDate && (
                selectedDayItems.length === 0 ? (
                  <p className="text-gray-400 text-sm py-8 text-center">予約はありません</p>
                ) : (
                  <div className="space-y-3">
                    {selectedDayItems.map((a) => (
                      <AppointmentRow key={a.id} appointment={a} onChanged={load} />
                    ))}
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ClinicAppointmentsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <AppointmentsPageInner />
    </Suspense>
  );
}
