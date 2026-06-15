"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Appointment, AppointmentStatus } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric", month: "long", day: "numeric",
    weekday: "short", hour: "2-digit", minute: "2-digit",
  });
}

const INVALID_REASON: Partial<Record<AppointmentStatus, string>> = {
  confirmation_pending: "患者の確認待ち",
  cancelled: "キャンセル済み",
  expired: "期限切れ",
  completed: "診察完了済み",
};

type PageState = "loading" | "confirm" | "done" | "invalid" | "not_found";

export default function ClinicCheckinPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string | null>(null);
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    params.then(({ token: t }) => setToken(t));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/appointments/${token}`)
      .then(async (res) => {
        if (!res.ok) { setPageState("not_found"); return; }
        const data: Appointment = await res.json();
        setAppt(data);
        if (data.status === "confirmed") {
          setPageState("confirm");
        } else if (data.status === "checked_in") {
          setPageState("done");
        } else {
          setPageState("invalid");
        }
      })
      .catch(() => setPageState("not_found"));
  }, [token]);

  const handleCheckin = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/appointments/${token}/checkin`, { method: "POST" });
      if (res.ok) {
        setPageState("done");
      } else {
        const body = await res.json().catch(() => ({}));
        if (body.error === "invalid_status") setPageState("invalid");
        else setPageState("not_found");
      }
    } catch {
      setPageState("not_found");
    } finally {
      setSubmitting(false);
    }
  };

  if (pageState === "loading") {
    return (
      <div className="min-h-screen bg-[#0B1629] text-white flex items-center justify-center">
        <p className="text-white/30 text-sm">読み込み中...</p>
      </div>
    );
  }

  if (pageState === "not_found") {
    return (
      <div className="min-h-screen bg-[#0B1629] text-white flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="font-bold mb-2">受付できません</p>
          <p className="text-sm text-white/50">予約番号を確認してください</p>
          <Link href="/clinic" className="mt-6 inline-block text-sm text-blue-400 hover:underline">← 予約一覧</Link>
        </div>
      </div>
    );
  }

  if (pageState === "invalid") {
    const reason = appt ? (INVALID_REASON[appt.status] ?? appt.status) : "";
    return (
      <div className="min-h-screen bg-[#0B1629] text-white flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">✕</p>
          <p className="font-bold mb-2">受付できません</p>
          {reason && <p className="text-sm text-white/50 mb-1">{reason}</p>}
          <p className="text-xs text-white/30">予約番号を確認してください</p>
          <Link href="/clinic" className="mt-6 inline-block text-sm text-blue-400 hover:underline">← 予約一覧</Link>
        </div>
      </div>
    );
  }

  if (pageState === "done") {
    return (
      <div className="min-h-screen bg-[#0B1629] text-white flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-5xl mb-4">✓</p>
          <p className="text-xl font-black mb-2">来院受付済み</p>
          {appt && <p className="text-sm text-white/50">{appt.patientName} さんの受付が完了しています</p>}
          <Link href="/clinic" className="mt-6 inline-block text-sm text-blue-400 hover:underline">← 予約一覧</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1629] text-white">
      <header className="border-b border-white/10 px-6 py-4">
        <Link href="/clinic" className="text-white/40 text-sm hover:text-white transition">← 予約一覧</Link>
        <h1 className="text-xl font-black mt-1">来院受付</h1>
      </header>

      <div className="max-w-lg mx-auto px-6 py-8 space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-3">
          {[
            { label: "予約番号", value: appt!.id.slice(0, 8).toUpperCase() },
            { label: "患者名",   value: appt!.patientName },
            { label: "予約日時", value: formatDate(appt!.appointmentAt) },
            { label: "クリニック", value: appt!.clinicName },
            { label: "ステータス", value: "確認済み" },
          ].map((row) => (
            <div key={row.label} className="flex gap-4">
              <span className="text-sm text-white/40 w-24 shrink-0">{row.label}</span>
              <span className="text-sm font-bold">{row.value}</span>
            </div>
          ))}
        </div>

        <button
          onClick={handleCheckin}
          disabled={submitting}
          className="w-full py-4 rounded-2xl bg-emerald-600 font-bold text-base hover:bg-emerald-500 transition disabled:opacity-50"
        >
          {submitting ? "処理中..." : "内容を確認して来院受付する"}
        </button>
      </div>
    </div>
  );
}
