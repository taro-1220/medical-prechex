"use client";
import { useEffect, useState } from "react";
import type { Appointment } from "@/lib/types";
import { maskPatientName, buildIcsContent } from "@/lib/ticket";
import { computeFreeCancellationDeadline, formatYen } from "@/lib/charge-policy";
import CardRegistration, { formatDeadline } from "../CardRegistration";

const TREATMENT_CATEGORY_LABEL: Record<string, string> = { private: "自由診療", insurance: "保険診療" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric", month: "long", day: "numeric",
    weekday: "short", hour: "2-digit", minute: "2-digit",
  });
}

type ErrorType = "not_found" | "load_failed";

export default function CompletePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string | null>(null);
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [cancelRequesting, setCancelRequesting] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [cancelPreview, setCancelPreview] = useState<{ applicable: boolean; percent?: number; amount?: number | null } | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [reauthenticating, setReauthenticating] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [retryingCard, setRetryingCard] = useState(false);

  useEffect(() => {
    params.then(({ token: t }) => setToken(t));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/appointments/${token}`)
      .then(async (res) => {
        if (res.status === 404) { setErrorType("not_found"); return; }
        if (!res.ok) { setErrorType("load_failed"); return; }
        setAppt(await res.json());
      })
      .catch(() => setErrorType("load_failed"));
  }, [token]);

  if (errorType === "not_found") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">🔍</p>
          <p className="font-bold text-gray-900 mb-2">予約が見つかりません</p>
          <p className="text-sm text-gray-500">URLをご確認いただくか、クリニックへお問い合わせください。</p>
        </div>
      </div>
    );
  }

  if (errorType === "load_failed") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="font-bold text-gray-900 mb-2">読み込みに失敗しました</p>
          <p className="text-sm text-gray-500">しばらく経ってから再度お試しください。</p>
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

  // MVP+2 D-2/D-3: 請求状態（キャンセル済みで初めて意味を持つため、cancelled分岐でも使う）
  const refetchAppointment = () => {
    if (!token) return;
    fetch(`/api/appointments/${token}`).then(async (res) => {
      if (res.ok) setAppt(await res.json());
    });
  };

  const handleReauth = async () => {
    if (!token || reauthenticating) return;
    setReauthenticating(true);
    setReauthError(null);
    try {
      const res = await fetch(`/api/appointments/${token}/reauth`);
      if (!res.ok) throw new Error("再認証の準備に失敗しました");
      const { clientSecret, connectedAccountId } = await res.json();
      const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!pk) throw new Error("設定エラー");
      const { loadStripe } = await import("@stripe/stripe-js");
      const stripe = await loadStripe(pk, { stripeAccount: connectedAccountId });
      if (!stripe) throw new Error("読み込みに失敗しました");
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret);
      if (error) throw new Error(error.message ?? "認証に失敗しました");
      if (paymentIntent?.status === "succeeded") {
        await fetch(`/api/appointments/${token}/reauth/confirm`, { method: "POST" });
        const refetch = await fetch(`/api/appointments/${token}`);
        if (refetch.ok) setAppt(await refetch.json());
      } else {
        setReauthError("認証が完了しませんでした");
      }
    } catch (e) {
      setReauthError(e instanceof Error ? e.message : "再認証に失敗しました");
    } finally {
      setReauthenticating(false);
    }
  };

  const freeCancellationDeadline = appt.cancelPolicyApplied
    ? computeFreeCancellationDeadline(appt.appointmentAt, appt.cancelPolicyTiers ?? null)
    : null;
  const needsCardRegistration = appt.cardRegistrationRequired && !appt.stripePaymentMethodId;

  const chargeStatusBlock = appt.cardRegistrationRequired && (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      {needsCardRegistration ? (
        <div className="space-y-3">
          <p className="text-sm text-amber-700 font-bold">お支払いカードのご登録がお済みではありません</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            ご来院いただければ請求は発生しません。ご都合によるキャンセルの場合のみ、条件に基づき登録のカードから自動的にお引き落としいたします。
          </p>
          <CardRegistration
            token={token!}
            clinicName={appt.clinicName}
            category={TREATMENT_CATEGORY_LABEL[appt.treatmentCategory] ?? appt.treatmentCategory}
            tiers={appt.cancelPolicyTiers ?? null}
            baseAmount={appt.baseAmount ?? null}
            onRegistered={refetchAppointment}
          />
        </div>
      ) : appt.chargeStatus === "charged" ? (
        <p className="text-sm text-gray-700">
          請求済み: <span className="font-bold">{formatYen(appt.chargedAmount ?? 0)}</span>
          {appt.chargeExecutedAt && `（${formatDate(appt.chargeExecutedAt)}`}
          {appt.baseAmount && appt.chargedAmount != null && `、同意条件: ${Math.round((appt.chargedAmount / appt.baseAmount) * 100)}%）`}
        </p>
      ) : appt.chargeStatus === "failed" ? (
        <div className="space-y-3">
          {/* Phase K-C: system_errorは別カード導線を出さず、医院連絡のみ案内する（誤誘導防止） */}
          {appt.chargeFailureKind === "system_error" ? (
            <>
              <p className="text-sm text-red-600 font-bold">お手続きを完了できませんでした</p>
              <p className="text-xs text-gray-500">
                請求額 <span className="font-bold text-gray-700">{formatYen(appt.chargedAmount ?? 0)}</span> の処理中にシステムエラーが発生しました。お手数ですが医院までご連絡ください。
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-red-600 font-bold">カードのお手続きが完了できませんでした</p>
              <p className="text-xs text-gray-500">
                請求額 <span className="font-bold text-gray-700">{formatYen(appt.chargedAmount ?? 0)}</span> のお引き落としができませんでした。
              </p>
              {retryingCard ? (
                <CardRegistration
                  token={token!}
                  clinicName={appt.clinicName}
                  category={TREATMENT_CATEGORY_LABEL[appt.treatmentCategory] ?? appt.treatmentCategory}
                  tiers={appt.cancelPolicyTiers ?? null}
                  baseAmount={appt.baseAmount ?? null}
                  onRegistered={() => { setRetryingCard(false); refetchAppointment(); }}
                />
              ) : (
                <button
                  onClick={() => setRetryingCard(true)}
                  className="w-full py-3 rounded-xl bg-gray-900 text-white font-bold text-sm hover:bg-gray-800 transition"
                >
                  別のカードでお手続きする
                </button>
              )}
            </>
          )}
          {appt.clinicPhone && (
            <a href={`tel:${appt.clinicPhone}`} className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-50 transition">
              📞 医院に電話する
            </a>
          )}
        </div>
      ) : appt.chargeStatus === "requires_action" ? (
        <div className="space-y-2">
          <p className="text-sm text-amber-700 font-bold">お支払い方法の確認が必要です</p>
          <button onClick={handleReauth} disabled={reauthenticating} className="w-full py-3 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 transition disabled:opacity-50">
            {reauthenticating ? "確認中..." : "お支払い方法を確認する"}
          </button>
          {reauthError && <p className="text-xs text-red-600">{reauthError}</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">ご来院いただければ請求は発生しません。</p>
          {freeCancellationDeadline && (
            <p className="text-sm font-bold text-teal-700 bg-teal-50 rounded-xl px-4 py-2.5">
              {formatDeadline(freeCancellationDeadline)} まで キャンセル無料
            </p>
          )}
        </div>
      )}
    </div>
  );

  if (appt.status === "cancelled") {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <header className="border-b border-gray-200 bg-white px-6 py-3 text-center">
          <span className="text-lg font-black text-teal-700">medipre</span>
        </header>
        <div className="max-w-sm mx-auto px-6 py-8 space-y-4">
          <div className="text-center">
            <p className="text-4xl mb-4">✕</p>
            <p className="font-bold text-gray-900 mb-2">この予約はキャンセルされています</p>
            {!appt.cardRegistrationRequired && (
              <p className="text-sm text-gray-500">ご不明な点はクリニックへお問い合わせください。</p>
            )}
          </div>
          {chargeStatusBlock}
        </div>
      </div>
    );
  }

  if (appt.status === "expired") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">⏱</p>
          <p className="font-bold text-gray-900 mb-2">確認期限が過ぎています</p>
          <p className="text-sm text-gray-500">クリニックへお問い合わせのうえ、再度ご予約ください。</p>
        </div>
      </div>
    );
  }

  if (appt.status === "checked_in" || appt.status === "completed") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl text-teal-600">✓</span>
          </div>
          <p className="text-xl font-black text-gray-900 mb-2">来院受付済み</p>
          <p className="text-sm text-gray-500">{appt.patientName} さんの来院受付は完了しています</p>
        </div>
      </div>
    );
  }

  const qrData = encodeURIComponent(`${window.location.origin}/confirm/${appt.token}/complete`);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=236x236&data=${qrData}&bgcolor=ffffff&color=0f766e&margin=16`;
  const ticketUrl = `${window.location.origin}/confirm/${appt.token}/complete`;
  const alreadyRequestedCancel = cancelRequested || !!appt.cancelRequestedAt;

  const handleDownloadIcs = () => {
    const ics = buildIcsContent({
      uid: appt.id,
      clinicName: appt.clinicName,
      description: appt.description,
      appointmentAt: appt.appointmentAt,
      ticketUrl,
      now: new Date().toISOString(),
    });
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medipre-${appt.id.slice(0, 8)}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openCancelConfirm = async () => {
    if (!token || alreadyRequestedCancel) return;
    const res = await fetch(`/api/appointments/${token}/cancel-preview`);
    if (res.ok) setCancelPreview(await res.json());
    setCancelConfirmOpen(true);
  };

  const handleCancelRequest = async () => {
    if (!token || cancelRequesting || alreadyRequestedCancel) return;
    setCancelRequesting(true);
    try {
      const res = await fetch(`/api/appointments/${token}/cancel-request`, { method: "POST" });
      if (res.ok) { setCancelRequested(true); setCancelConfirmOpen(false); }
    } finally {
      setCancelRequesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-3 text-center">
        <span className="text-lg font-black text-teal-700">medipre</span>
      </header>

      <div className="max-w-sm mx-auto px-6 py-4 space-y-4">
        {/* チケットヘッダー */}
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-2">Ticket</p>
          <h1 className="text-2xl font-black text-gray-900">予約確定チケット</h1>
        </div>

        {/* バッジ */}
        <div className="flex justify-center gap-3 flex-wrap">
          {[
            { label: "予約確認済" },
            { label: "同意取得済" },
            { label: "QRチケット発行済" },
          ].map((b) => (
            <span key={b.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold">
              <span className="text-teal-500">✓</span> {b.label}
            </span>
          ))}
        </div>

        {/* QR */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 flex flex-col items-center gap-3">
          <img
            src={qrUrl}
            alt="受付提示用QRコード"
            width={236}
            height={236}
            className="rounded-xl"
          />
          <p className="text-sm text-gray-600 text-center">ご来院当日、この画面を受付スタッフへご提示ください。</p>
          <div className="w-full rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
            <p className="text-xs text-amber-800 font-bold">受付では、この画面をスタッフへご提示ください。</p>
            <p className="text-xs text-amber-700">受付はスタッフが行います。</p>
          </div>
        </div>

        {/* 予約情報 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
          {[
            { label: "予約番号", value: appt.id.slice(0, 8).toUpperCase() },
            { label: "クリニック", value: appt.clinicName },
            { label: "患者名", value: maskPatientName(appt.patientName) },
            { label: "予約日時", value: formatDate(appt.appointmentAt) },
            { label: "内容", value: appt.description },
          ].map((row) => (
            <div key={row.label} className="flex gap-4">
              <span className="text-xs text-gray-400 w-20 shrink-0 pt-0.5">{row.label}</span>
              <span className="text-sm font-bold text-gray-900 leading-snug">{row.value}</span>
            </div>
          ))}
        </div>

        {/* アクション */}
        <div className="rounded-2xl border border-gray-200 bg-white p-2 divide-y divide-gray-100">
          <button onClick={handleDownloadIcs} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition rounded-xl">
            <span className="text-lg">📅</span>
            <span className="text-sm font-bold text-gray-800">カレンダーに追加</span>
          </button>
          {appt.cancelPolicyApplied && (
            <button onClick={() => setPolicyModalOpen(true)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition rounded-xl">
              <span className="text-lg">📄</span>
              <span className="text-sm font-bold text-gray-800">キャンセルポリシー</span>
            </button>
          )}
          {appt.clinicPhone && (
            <a href={`tel:${appt.clinicPhone}`} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition rounded-xl">
              <span className="text-lg">📞</span>
              <span className="text-sm font-bold text-gray-800">医院に電話する</span>
            </a>
          )}
          <button
            onClick={openCancelConfirm}
            disabled={cancelRequesting || alreadyRequestedCancel}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition rounded-xl disabled:cursor-default disabled:hover:bg-transparent"
          >
            <span className="text-lg">✕</span>
            <span className={`text-sm font-bold ${alreadyRequestedCancel ? "text-gray-400" : "text-gray-800"}`}>
              {alreadyRequestedCancel ? "医院へキャンセルのご連絡を受け付けました" : "キャンセルを申し出る"}
            </span>
          </button>
        </div>

        {/* MVP+2 D-2: 請求状態 */}
        {chargeStatusBlock}

        <p className="text-center text-xs text-gray-400 pb-4">
          このQRは予約確認・同意取得が完了していることを示します。
        </p>
      </div>

      {/* キャンセル確認モーダル（D-2: 現時点で適用される段階を表示してから確認を挟む） */}
      {cancelConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="キャンセルの確認">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCancelConfirmOpen(false)} />
          <div className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[85vh] sm:mx-6">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100">
              <p className="text-base font-bold text-gray-900">キャンセルの確認</p>
            </div>
            <div className="px-6 py-4 space-y-3">
              {cancelPreview?.applicable && (cancelPreview.amount ?? 0) > 0 ? (
                <p className="text-sm text-gray-700 leading-relaxed">
                  現時点でのキャンセルには、条件に基づき<span className="font-bold">{formatYen(cancelPreview.amount ?? 0)}（{cancelPreview.percent}%）</span>を登録のカードから自動的にお引き落としいたします。
                </p>
              ) : (
                <p className="text-sm text-gray-700 leading-relaxed">現時点でのキャンセルは無料です。</p>
              )}
              <p className="text-xs text-gray-400">よろしければ「キャンセルする」を押してください。</p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
              <button type="button" onClick={() => setCancelConfirmOpen(false)} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition">
                戻る
              </button>
              <button type="button" onClick={handleCancelRequest} disabled={cancelRequesting} className="flex-1 py-3 rounded-2xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition disabled:opacity-50">
                {cancelRequesting ? "処理中..." : "キャンセルする"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* キャンセルポリシーモーダル */}
      {policyModalOpen && appt.cancelPolicyApplied && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="キャンセルポリシー">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPolicyModalOpen(false)} />
          <div className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[85vh] sm:mx-6">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100">
              <p className="text-base font-bold text-gray-900">キャンセルポリシー</p>
              {appt.cancelPolicyAgreedAt && (
                <p className="text-xs text-gray-400 mt-1">同意日時: {formatDate(appt.cancelPolicyAgreedAt)}</p>
              )}
            </div>
            <div className="px-6 py-4 overflow-y-auto space-y-3">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{appt.cancelPolicySnapshot}</p>
              {appt.cancelPolicyShowBasisToPatient && appt.cancelPolicyBasisNote && (
                <p className="text-xs text-gray-500 leading-relaxed">{appt.cancelPolicyBasisNote}</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100">
              <button type="button" onClick={() => setPolicyModalOpen(false)} className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition">
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
