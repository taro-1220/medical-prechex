"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Appointment } from "@/lib/types";
import CardRegistration, { formatDeadline } from "./CardRegistration";
import { computeFreeCancellationDeadline } from "@/lib/charge-policy";

const TREATMENT_CATEGORY_LABEL: Record<string, string> = { private: "自由診療", insurance: "保険診療" };

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
  const [policyOpen, setPolicyOpen] = useState(false);
  const [cancelPolicyConsented, setCancelPolicyConsented] = useState(false);

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

  const cancelPolicyApplied = appt?.cancelPolicyApplied ?? false;
  const needsCardRegistration = !!appt?.cardRegistrationRequired && !appt?.stripePaymentMethodId;
  const canConfirm = consented && (!cancelPolicyApplied || cancelPolicyConsented) && !needsCardRegistration;

  const refetchAppointment = () => {
    if (!token) return;
    fetch(`/api/appointments/${token}`).then(async (res) => {
      if (res.ok) setAppt(await res.json());
    });
  };

  const handleConfirm = async () => {
    if (!token || !canConfirm) return;
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!appt) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  const hasPolicy = appt.cancellationPolicy.trim().length > 0;
  const freeCancellationDeadline = cancelPolicyApplied
    ? computeFreeCancellationDeadline(appt.appointmentAt, appt.cancelPolicyTiers ?? null)
    : null;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4 text-center">
        <span className="text-lg font-black text-teal-700">medipre</span>
        <p className="text-xs text-gray-400 mt-0.5">予約確認</p>
      </header>

      <div className="max-w-lg mx-auto px-6 py-8 space-y-6">
        {/* 予約情報 */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">予約内容</p>
          <div className="space-y-3">
            {[
              { label: "クリニック", value: appt.clinicName },
              { label: "患者名", value: appt.patientName },
              { label: "予約日時", value: formatDate(appt.appointmentAt) },
              { label: "内容", value: appt.description },
            ].map((row) => (
              <div key={row.label} className="flex gap-4">
                <span className="text-sm text-gray-400 w-20 shrink-0">{row.label}</span>
                <span className="text-sm font-bold text-gray-900">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* キャンセルについて（適用ありの場合のみ描画。無い場合は「対象外」表示すら出さない） */}
        {cancelPolicyApplied && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">キャンセルについて</p>
            <p className="text-sm text-gray-700 leading-relaxed">
              このご予約は〔{TREATMENT_CATEGORY_LABEL[appt.treatmentCategory] ?? appt.treatmentCategory}〕のため、
              {appt.clinicName}のキャンセルポリシーが適用されます
            </p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-xl px-4 py-3">
              {appt.cancelPolicySnapshot}
            </p>
            {freeCancellationDeadline && (
              <p className="text-sm font-bold text-teal-700 bg-teal-50 rounded-xl px-4 py-2.5">
                {formatDeadline(freeCancellationDeadline)} まで キャンセル無料
              </p>
            )}
            {appt.cancelPolicyShowBasisToPatient && appt.cancelPolicyBasisNote && (
              <p className="text-xs text-gray-500 leading-relaxed">{appt.cancelPolicyBasisNote}</p>
            )}
            <label className="flex items-start gap-3 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={cancelPolicyConsented}
                onChange={(e) => setCancelPolicyConsented(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-teal-600 shrink-0"
              />
              <span className="text-sm text-gray-700 leading-relaxed">上記を確認し、同意します</span>
            </label>
          </div>
        )}

        {/* MVP+2 D-1: カード登録（適用時かつ登録必須の予約のみ、同意ステップの後） */}
        {needsCardRegistration && (
          <CardRegistration
            token={token!}
            clinicName={appt.clinicName}
            category={TREATMENT_CATEGORY_LABEL[appt.treatmentCategory] ?? appt.treatmentCategory}
            tiers={appt.cancelPolicyTiers ?? null}
            baseAmount={appt.baseAmount ?? null}
            onRegistered={refetchAppointment}
          />
        )}

        {/* 同意 */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded accent-teal-600 shrink-0"
          />
          <span className="text-sm text-gray-700 leading-relaxed">
            {hasPolicy ? (
              <>
                予約内容および
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setPolicyOpen(true); }}
                  className="text-teal-600 font-bold underline underline-offset-2 hover:text-teal-700"
                >
                  「予約時の確認事項」
                </button>
                を確認しました
              </>
            ) : (
              "予約内容を確認しました"
            )}
          </span>
        </label>

        {/* CTA */}
        <button
          onClick={handleConfirm}
          disabled={!canConfirm || submitting}
          className="w-full py-4 rounded-2xl bg-teal-600 text-white font-bold text-base hover:bg-teal-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {submitting ? "確認中..." : "予約内容を確認して確定"}
        </button>

        <p className="text-center text-xs text-gray-400 leading-relaxed">
          確定後にQR来院チケットが発行されます。<br />
          来院時に受付でご提示ください。
        </p>
      </div>

      {/* 予約時の確認事項モーダル */}
      {policyOpen && hasPolicy && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="予約時の確認事項"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setPolicyOpen(false)}
          />
          <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[85vh] sm:mx-6">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100">
              <p className="text-base font-bold text-gray-900">予約時の確認事項</p>
            </div>
            <div className="px-6 py-4 overflow-y-auto">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{appt.cancellationPolicy}</p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setPolicyOpen(false)}
                className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
