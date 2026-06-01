"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Appointment } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric", month: "long", day: "numeric",
    weekday: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    params.then(({ token: t }) => setToken(t));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/appointments/${token}`)
      .then(async (res) => {
        if (!res.ok) { setError("予約が見つかりません"); return; }
        const data: Appointment = await res.json();
        if (data.status === "confirmed" || data.status === "ticket_issued") {
          router.replace(`/confirm/${token}/complete`);
          return;
        }
        if (data.status === "cancelled") { setError("この予約はキャンセルされました"); return; }
        if (data.status === "expired") { setError("確認期限が過ぎています。クリニックにお問い合わせください"); return; }
        if (data.status === "checked_in") {
          setError("来院確認済みです"); return;
        }
        setAppt(data);
      })
      .catch(() => setError("読み込みに失敗しました"));
  }, [token, router]);

  const handleConfirm = async () => {
    if (!token || !consented) return;
    setSubmitting(true);
    const res = await fetch(`/api/appointments/${token}/confirm`, { method: "POST" });
    if (res.ok) {
      router.push(`/confirm/${token}/complete`);
    } else {
      setError("確認処理に失敗しました。再度お試しください");
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#0B1629] text-white flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-white/60">{error}</p>
        </div>
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

  return (
    <div className="min-h-screen bg-[#0B1629] text-white">
      <header className="border-b border-white/10 px-6 py-4 text-center">
        <span className="text-lg font-black">PreChex</span>
        <p className="text-xs text-white/40 mt-0.5">予約確認</p>
      </header>

      <div className="max-w-lg mx-auto px-6 py-8 space-y-6">
        {/* 予約情報 */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4">予約内容</p>
          <div className="space-y-3">
            {[
              { label: "クリニック", value: appt.clinicName },
              { label: "患者名", value: appt.patientName },
              { label: "予約日時", value: formatDate(appt.appointmentAt) },
              { label: "内容", value: appt.description },
            ].map((row) => (
              <div key={row.label} className="flex gap-4">
                <span className="text-sm text-white/40 w-20 shrink-0">{row.label}</span>
                <span className="text-sm font-bold">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* キャンセルポリシー */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">キャンセルポリシー</p>
          <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{appt.cancellationPolicy}</p>
        </div>

        {/* 同意 */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded accent-blue-500 shrink-0"
          />
          <span className="text-sm text-white/70 leading-relaxed">
            予約内容およびキャンセルポリシーを確認しました
          </span>
        </label>

        {/* CTA */}
        <button
          onClick={handleConfirm}
          disabled={!consented || submitting}
          className="w-full py-4 rounded-2xl bg-blue-600 font-bold text-base hover:bg-blue-500 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {submitting ? "確認中..." : "予約内容を確認して確定"}
        </button>

        <p className="text-center text-xs text-white/30 leading-relaxed">
          確定後にQR来院チケットが発行されます。<br />
          来院時に受付でご提示ください。
        </p>
      </div>
    </div>
  );
}
