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
  confirmation_pending: "患者がまだ予約確認を完了していません",
  cancelled: "この予約はキャンセルされています",
  expired: "予約確認の期限が過ぎています",
  completed: "この予約は診察完了済みです",
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  if (pageState === "not_found") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">🔍</p>
          <p className="font-bold text-gray-900 mb-2">予約が見つかりません</p>
          <p className="text-sm text-gray-500">QRが正しく読み取れていないか、存在しない予約です。予約一覧から確認してください。</p>
          <Link href="/clinic" className="mt-6 inline-block text-sm text-teal-600 hover:underline">← 予約一覧</Link>
        </div>
      </div>
    );
  }

  if (pageState === "invalid") {
    const reason = appt ? (INVALID_REASON[appt.status] ?? appt.status) : "";
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">✕</p>
          <p className="font-bold text-gray-900 mb-2">来院受付できません</p>
          {reason && <p className="text-sm text-gray-700 mb-3">{reason}</p>}
          <Link href="/clinic" className="mt-2 inline-block text-sm text-teal-600 hover:underline">← 予約一覧へ戻る</Link>
        </div>
      </div>
    );
  }

  if (pageState === "done") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl text-teal-600">✓</span>
          </div>
          <p className="text-xl font-black text-gray-900 mb-2">来院受付済み</p>
          {appt && <p className="text-sm text-gray-500">{appt.patientName} さんの受付が完了しています</p>}
          <Link href="/clinic" className="mt-6 inline-block text-sm text-teal-600 hover:underline">← 予約一覧</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/clinic" className="text-gray-400 text-sm hover:text-gray-700 transition">← 予約一覧</Link>
        <h1 className="text-xl font-black text-gray-900 mt-1">来院受付</h1>
      </header>

      <div className="max-w-lg mx-auto px-6 py-8 space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-3">
          {[
            { label: "予約番号",   value: appt!.id.slice(0, 8).toUpperCase() },
            { label: "患者名",     value: appt!.patientName },
            { label: "予約日時",   value: formatDate(appt!.appointmentAt) },
            { label: "クリニック", value: appt!.clinicName },
            { label: "ステータス", value: "確認済み" },
          ].map((row) => (
            <div key={row.label} className="flex gap-4">
              <span className="text-sm text-gray-400 w-24 shrink-0">{row.label}</span>
              <span className="text-sm font-bold text-gray-900">{row.value}</span>
            </div>
          ))}
        </div>

        <button
          onClick={handleCheckin}
          disabled={submitting}
          className="w-full py-4 rounded-2xl bg-teal-600 text-white font-bold text-base hover:bg-teal-700 transition disabled:opacity-50"
        >
          {submitting ? "処理中..." : "内容を確認して来院受付する"}
        </button>
      </div>
    </div>
  );
}
