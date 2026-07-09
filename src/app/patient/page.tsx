"use client";
import { useEffect, useState } from "react";
import type { AppointmentStatus, PatientMeResponse } from "@/lib/types";

// Phase1: no login. This page always shows the dummy patient returned by
// /api/patient/me. Future routes /patient/login, /patient/history,
// /patient/profile extend this directory once Phase2 auth exists.

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric", month: "long", day: "numeric",
    weekday: "short", hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmation_pending: "確認待ち",
  confirmed: "確定",
  ticket_issued: "QRチケット発行済み",
  checked_in: "来院受付済み",
  completed: "受診完了",
  cancelled: "キャンセル",
  expired: "期限切れ",
};

const COMING_SOON = [
  { icon: "💬", label: "LINEログイン" },
  { icon: "🔔", label: "予約通知" },
  { icon: "📱", label: "QR再表示" },
  { icon: "👨‍👩‍👧", label: "家族管理" },
  { icon: "⭐", label: "お気に入り医院" },
];

export default function PatientMyPage() {
  const [data, setData] = useState<PatientMeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/patient/me")
      .then(async (res) => {
        if (!res.ok) { setError("読み込みに失敗しました"); return; }
        setData(await res.json());
      })
      .catch(() => setError("読み込みに失敗しました"));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  const { patient, nextAppointment, appointmentHistory, consentHistory } = data;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4 text-center">
        <span className="text-lg font-black text-teal-700">medipre</span>
        <p className="text-xs text-gray-400 mt-0.5">マイページ</p>
      </header>

      <div className="max-w-lg mx-auto px-6 py-8 space-y-6">
        {/* 次回予約 */}
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">次回予約</p>
          {nextAppointment ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-gray-900">{nextAppointment.clinicName}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{formatDate(nextAppointment.appointmentAt)}</p>
                </div>
                <span className="shrink-0 px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold">
                  {STATUS_LABEL[nextAppointment.status]}
                </span>
              </div>
              <p className="text-sm text-gray-600">{nextAppointment.description}</p>
              <a
                href={`/confirm/${nextAppointment.token}/complete`}
                className="block w-full text-center py-3 rounded-2xl bg-teal-600 text-white text-sm font-bold"
              >
                QR表示
              </a>
            </div>
          ) : (
            <p className="text-sm text-gray-400">現在予約はありません</p>
          )}
        </section>

        {/* 来院履歴 */}
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">来院履歴</p>
          {appointmentHistory.length > 0 ? (
            <ul className="space-y-4">
              {appointmentHistory.slice(0, 10).map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{a.clinicName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatDate(a.appointmentAt)}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{a.description}</p>
                  </div>
                  <span className="shrink-0 px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-600 text-xs font-bold">
                    {STATUS_LABEL[a.status]}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">来院履歴はありません</p>
          )}
        </section>

        {/* 同意履歴 */}
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">同意履歴</p>
          {consentHistory.length > 0 ? (
            <ul className="space-y-3">
              {consentHistory.map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-gray-900">{c.clinicName}</p>
                  <p className="text-xs text-gray-500">{formatDate(c.consentedAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">同意履歴はありません</p>
          )}
        </section>

        {/* 患者情報 */}
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">患者情報</p>
          <div className="space-y-3">
            {[
              { label: "氏名", value: patient.name },
              { label: "電話番号", value: patient.phone },
              { label: "メール", value: patient.email },
            ].map((f) => (
              <div key={f.label} className="flex items-center justify-between gap-3">
                <p className="text-xs text-gray-400">{f.label}</p>
                <p className="text-sm font-bold text-gray-900">{f.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Coming Soon */}
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 px-1">Coming Soon</p>
          <div className="grid grid-cols-2 gap-3">
            {COMING_SOON.map((c) => (
              <div
                key={c.label}
                aria-disabled="true"
                className="rounded-2xl border border-gray-200 bg-white/60 shadow-sm p-4 text-center opacity-50 cursor-not-allowed select-none"
              >
                <p className="text-2xl mb-1">{c.icon}</p>
                <p className="text-xs font-bold text-gray-600">{c.label}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
