"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Appointment, AppointmentStatus } from "@/lib/types";
import OnboardingGuide, { GUIDE_KEY } from "./OnboardingGuide";

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmation_pending: "確認待ち",
  confirmed: "確認済み",
  ticket_issued: "確認済み",
  checked_in: "来院済み",
  completed: "完了",
  cancelled: "キャンセル",
  expired: "期限切れ",
};

const STATUS_COLOR: Record<AppointmentStatus, string> = {
  confirmation_pending: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-teal-100 text-teal-700",
  ticket_issued: "bg-teal-100 text-teal-700",
  checked_in: "bg-emerald-100 text-emerald-700",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-gray-100 text-gray-400",
  expired: "bg-gray-100 text-gray-400",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const isConfirmed = (s: AppointmentStatus) => s === "confirmed" || s === "ticket_issued";
const isVisited = (s: AppointmentStatus) => s === "checked_in";
const isCancelled = (s: AppointmentStatus) => s === "cancelled" || s === "expired";

export default function ClinicPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(GUIDE_KEY)) {
      setShowGuide(true);
    }
  }, []);

  const load = async () => {
    try {
      const res = await fetch("/api/appointments");
      if (!res.ok) { setAppointments([]); return; }
      const data = await res.json();
      setAppointments(Array.isArray(data) ? data : []);
    } catch {
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const sorted = [...appointments].sort((a, b) => {
    const diff = new Date(a.appointmentAt).getTime() - new Date(b.appointmentAt).getTime();
    if (diff !== 0) return diff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const markCompleted = async (token: string) => {
    await fetch(`/api/appointments/${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    load();
  };

  const markCheckedIn = async (token: string) => {
    await fetch(`/api/appointments/${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "checked_in" }),
    });
    load();
  };

  const today = new Date().toDateString();
  const summary = {
    today: appointments.filter(a => new Date(a.appointmentAt).toDateString() === today).length,
    pending: appointments.filter(a => a.status === "confirmation_pending").length,
    confirmed: appointments.filter(a => isConfirmed(a.status)).length,
    visited: appointments.filter(a => isVisited(a.status)).length,
    cancelled: appointments.filter(a => isCancelled(a.status)).length,
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <Link href="/" className="text-gray-400 text-sm hover:text-gray-900 transition">← medipre</Link>
          <h1 className="text-xl font-black mt-1 text-gray-900">クリニック管理画面</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGuide(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 text-sm hover:bg-gray-100 transition"
            title="使い方ガイド"
          >
            ?
          </button>
          <Link href="/clinic/checkin" className="px-4 py-2 bg-emerald-600 rounded-xl font-bold text-sm text-white hover:bg-emerald-700 transition">
            QR受付
          </Link>
          <Link href="/clinic/new" className="px-4 py-2 bg-teal-600 rounded-xl font-bold text-sm text-white hover:bg-teal-700 transition">
            ＋ 新規予約
          </Link>
        </div>
      </header>
      {showGuide && <OnboardingGuide onClose={() => setShowGuide(false)} />}

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          {[
            { label: "本日の予約", value: summary.today },
            { label: "確認待ち", value: summary.pending, color: "text-yellow-600" },
            { label: "確認済", value: summary.confirmed, color: "text-teal-600" },
            { label: "来院済", value: summary.visited, color: "text-emerald-600" },
            { label: "キャンセル", value: summary.cancelled, color: "text-gray-400" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4 text-center">
              <p className="text-sm text-gray-500 mb-1">{s.label}</p>
              <p className={`text-3xl font-black ${s.color ?? "text-gray-900"}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* List */}
        <h2 className="text-base font-bold mb-4 text-gray-700">予約一覧</h2>
        {loading ? (
          <p className="text-gray-400 text-sm">読み込み中...</p>
        ) : appointments.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p>予約はまだありません</p>
            <Link href="/clinic/new" className="mt-4 inline-block text-teal-600 text-sm hover:underline">
              新規予約を作成する
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((a) => (
              <div key={a.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${STATUS_COLOR[a.status]}`}>
                      {STATUS_LABEL[a.status]}
                    </span>
                    <span className="text-gray-400 text-xs">{formatDate(a.appointmentAt)}</span>
                    <span className="text-gray-300 text-xs font-mono">#{a.id.slice(0, 8)}</span>
                  </div>
                  <p className="font-bold text-gray-900">{a.patientName}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                    {a.phone && <span className="text-xs text-gray-500">{a.phone}</span>}
                    {a.email && <span className="text-xs text-gray-500">{a.email}</span>}
                  </div>
                  {a.consentAt && (
                    <p className="text-xs text-teal-600 mt-1">同意: {formatDate(a.consentAt)}</p>
                  )}
                  {a.checkedInAt && (
                    <p className="text-xs text-emerald-600 mt-0.5">来院: {formatDate(a.checkedInAt)}</p>
                  )}
                  <p className="text-sm text-gray-500 mt-0.5">{a.description}</p>
                  <p className="text-xs text-gray-400 mt-1">{a.clinicName}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button
                    onClick={() => navigator.clipboard.writeText(`${location.origin}/confirm/${a.token}`)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs hover:bg-gray-50 transition"
                  >
                    URL コピー
                  </button>
                  {a.status === "confirmed" && (
                    <Link
                      href={`/clinic/checkin/${a.token}`}
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs hover:bg-emerald-100 transition"
                    >
                      来院受付
                    </Link>
                  )}
                  {a.status === "checked_in" && (
                    <button
                      onClick={() => markCompleted(a.token)}
                      className="px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 text-xs hover:bg-teal-100 transition"
                    >
                      診察完了
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
