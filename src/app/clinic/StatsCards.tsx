"use client";
import Link from "next/link";
import type { Appointment } from "@/lib/types";
import { isTodayJst, matchesStatus } from "@/lib/clinic-appointments-view";
import { activeFromQuery, type StatsCardsActive } from "./stats-cards-active";

export { activeFromQuery };
export type { StatsCardsActive };

type Card = { key: Exclude<StatsCardsActive, null>; label: string; value: number; color?: string; href: string };

export function StatsCards({
  appointments,
  active,
  showScopeNote = false,
}: {
  appointments: Appointment[];
  active: StatsCardsActive;
  showScopeNote?: boolean;
}) {
  const nowIso = new Date().toISOString();
  const summary = {
    today: appointments.filter((a) => isTodayJst(a.appointmentAt, nowIso)).length,
    pending: appointments.filter((a) => matchesStatus(a.status, "pending")).length,
    confirmed: appointments.filter((a) => matchesStatus(a.status, "confirmed")).length,
    visited: appointments.filter((a) => matchesStatus(a.status, "visited")).length,
    canceled: appointments.filter((a) => matchesStatus(a.status, "canceled")).length,
  };

  const cards: Card[] = [
    { key: "today", label: "本日の予約", value: summary.today, href: "/clinic/appointments?range=today" },
    { key: "pending", label: "確認待ち", value: summary.pending, color: "text-yellow-600", href: "/clinic/appointments?range=all&status=pending" },
    { key: "confirmed", label: "確認済", value: summary.confirmed, color: "text-teal-600", href: "/clinic/appointments?range=all&status=confirmed" },
    { key: "visited", label: "来院済", value: summary.visited, color: "text-emerald-600", href: "/clinic/appointments?range=all&status=visited" },
    { key: "canceled", label: "キャンセル", value: summary.canceled, color: "text-gray-400", href: "/clinic/appointments?range=all&status=canceled" },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {cards.map((c) => {
          const isActive = active !== null && active === c.key;
          return (
            <Link
              key={c.key}
              href={c.href}
              aria-current={isActive ? "page" : undefined}
              className={`rounded-2xl border p-4 text-center hover:-translate-y-0.5 hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                isActive ? "border-teal-500 ring-2 ring-teal-200 bg-teal-50" : "border-gray-200 bg-white shadow-sm"
              }`}
            >
              <p className="text-sm text-gray-500 mb-1">{c.label}</p>
              <p className={`text-3xl font-black ${c.color ?? "text-gray-900"}`}>{c.value}</p>
            </Link>
          );
        })}
      </div>
      {showScopeNote && <p className="text-xs text-gray-400 mt-2">件数は全期間の合計です</p>}
    </div>
  );
}
