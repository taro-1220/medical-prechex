"use client";
import { useEffect, useState } from "react";
import type { Appointment } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric", month: "long", day: "numeric",
    weekday: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function CompletePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string | null>(null);
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ token: t }) => setToken(t));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/appointments/${token}`)
      .then(async (res) => {
        if (!res.ok) { setError("予約が見つかりません"); return; }
        setAppt(await res.json());
      })
      .catch(() => setError("読み込みに失敗しました"));
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#0B1629] text-white flex items-center justify-center px-6">
        <div className="text-center"><p className="text-4xl mb-4">⚠️</p><p className="text-white/60">チケットを確認できません</p></div>
      </div>
    );
  }

  if (!appt) {
    return (
      <div className="min-h-screen bg-[#0B1629] text-white flex items-center justify-center">
        <p className="text-white/30 text-sm">読み込み中...</p>
      </div>
    );
  }

  if (appt.status === "checked_in" || appt.status === "completed") {
    return (
      <div className="min-h-screen bg-[#0B1629] text-white flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-5xl mb-4">✓</p>
          <p className="text-xl font-black mb-2">来院受付済み</p>
          <p className="text-sm text-white/50">{appt.patientName} さんの来院受付は完了しています</p>
        </div>
      </div>
    );
  }

  const qrData = encodeURIComponent(`${window.location.origin}/confirm/${appt.token}/complete`);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}&bgcolor=0B1629&color=ffffff&margin=16`;

  return (
    <div className="min-h-screen bg-[#0B1629] text-white">
      <header className="border-b border-white/10 px-6 py-4 text-center">
        <span className="text-lg font-black">PreChex</span>
      </header>

      <div className="max-w-sm mx-auto px-6 py-8 space-y-6">
        {/* チケットヘッダー */}
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-2">Ticket</p>
          <h1 className="text-2xl font-black">予約確定チケット</h1>
        </div>

        {/* バッジ */}
        <div className="flex justify-center gap-3 flex-wrap">
          {[
            { icon: "✓", label: "予約確認済" },
            { icon: "✓", label: "同意取得済" },
            { icon: "✓", label: "来院用QR" },
          ].map((b) => (
            <span key={b.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-bold">
              <span className="text-emerald-400">{b.icon}</span> {b.label}
            </span>
          ))}
        </div>

        {/* QR */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-col items-center gap-4">
          <img
            src={qrUrl}
            alt="来院用QRコード"
            width={200}
            height={200}
            className="rounded-xl"
          />
          <p className="text-sm font-bold text-white/80">受付スタッフにこのQRを提示してください</p>
          <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-center space-y-1">
            <p className="text-xs text-yellow-300/80 font-bold">この画面は来院受付用ではありません</p>
            <p className="text-xs text-white/40">読み取っただけでは受付完了になりません</p>
          </div>
        </div>

        {/* 予約情報 */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
          {[
            { label: "予約番号", value: appt.id.slice(0, 8).toUpperCase() },
            { label: "クリニック", value: appt.clinicName },
            { label: "患者名", value: appt.patientName },
            { label: "予約日時", value: formatDate(appt.appointmentAt) },
            { label: "内容", value: appt.description },
          ].map((row) => (
            <div key={row.label} className="flex gap-4">
              <span className="text-xs text-white/40 w-20 shrink-0 pt-0.5">{row.label}</span>
              <span className="text-sm font-bold leading-snug">{row.value}</span>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-white/30 pb-4">
          このチケットは予約確認・同意取得済みの証明です
        </p>
      </div>
    </div>
  );
}
