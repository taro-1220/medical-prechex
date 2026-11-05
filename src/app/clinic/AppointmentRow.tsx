"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Appointment, AppointmentStatus } from "@/lib/types";
import { getAccessToken } from "@/lib/clinic-auth";

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmation_pending: "確認待ち",
  confirmed: "確認済み",
  ticket_issued: "確認済み",
  checked_in: "来院済み",
  completed: "完了",
  cancelled: "キャンセル",
  expired: "期限切れ",
};

export const STATUS_COLOR: Record<AppointmentStatus, string> = {
  confirmation_pending: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-teal-100 text-teal-700",
  ticket_issued: "bg-teal-100 text-teal-700",
  checked_in: "bg-emerald-100 text-emerald-700",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-gray-100 text-gray-400",
  expired: "bg-gray-100 text-gray-400",
};

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const isCancelled = (s: AppointmentStatus) => s === "cancelled" || s === "expired";

/** Phase J セクションC: 一覧の「要対応」判定。時系列より上に固定表示する対象を決める */
export function attentionReasons(a: Appointment): string[] {
  const reasons: string[] = [];
  if (a.cardRegistrationRequired && !a.stripePaymentMethodId && !isCancelled(a.status) && a.status !== "completed") {
    reasons.push("カード未登録");
  }
  if (a.chargeStatus === "failed") reasons.push("請求失敗");
  if (a.chargeStatus === "requires_action") reasons.push("要再認証");
  return reasons;
}

/** /clinic と /clinic/appointments の一覧で共通して使う予約の行。行を押すと詳細へ移動する。 */
export function AppointmentRow({ appointment: a, onChanged }: { appointment: Appointment; onChanged: () => void }) {
  const router = useRouter();
  const [copyStatus, setCopyStatus] = useState<"success" | "error" | null>(null);

  const copyConfirmUrl = async () => {
    if (!a.token) return;
    try {
      await navigator.clipboard.writeText(`${location.origin}/confirm/${a.token}`);
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
    }
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const markCompleted = async () => {
    const accessToken = await getAccessToken();
    await fetch(`/api/appointments/${a.token}/complete`, {
      method: "POST",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
    onChanged();
  };

  const openDetail = () => router.push(`/clinic/appointments/${a.id}/detail`);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter") openDetail();
      }}
      className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 flex items-start justify-between gap-4 cursor-pointer hover:bg-gray-50 transition focus:outline-none focus:ring-2 focus:ring-teal-500"
    >
      <div className="flex-1 min-w-0">
        {/* Phase J セクションC: バッジは「状態」「要対応」の2軸のみ。他の内部状態はテキストで示す */}
        <div className="flex items-center gap-3 mb-2">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${STATUS_COLOR[a.status]}`}>
            {STATUS_LABEL[a.status]}
          </span>
          {attentionReasons(a).length > 0 && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
              ⚠ 要対応（{attentionReasons(a).join("・")}）
            </span>
          )}
          <span className="text-gray-400 text-xs">{formatDate(a.appointmentAt)}</span>
          <span className="text-gray-300 text-xs font-mono">#{a.id.slice(0, 8)}</span>
        </div>
        <p className="font-bold text-gray-900">{a.patientName}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
          {a.phone && <span className="text-xs text-gray-500">{a.phone}</span>}
          {a.email && <span className="text-xs text-gray-500">{a.email}</span>}
        </div>
        <div className="mt-1 space-y-0.5">
          <p className="text-xs text-gray-400">
            {(() => {
              // 送信申告済み媒体（自動検知ではなくスタッフ申告の記録）
              const sentChannels = [a.lineSentAt && "LINE", a.smsSentAt && "SMS", a.emailSentAt && "メール"].filter(Boolean);
              return sentChannels.length ? `確認URL: 送信済み（${sentChannels.join("・")}）` : "確認URL未送信";
            })()}
          </p>
          {a.cancelPolicyApplied && (
            <p className="text-xs text-gray-400">
              キャンセルポリシー: {a.cancelPolicyAgreedAt ? `同意済み（${formatDate(a.cancelPolicyAgreedAt)}）` : "未同意"}
            </p>
          )}
          {a.cancelRequestedAt && (
            <p className="text-xs text-red-600">キャンセル申出: {formatDate(a.cancelRequestedAt)}</p>
          )}
          {a.cardRegistrationRequired && a.stripePaymentMethodId && (
            <p className="text-xs text-gray-400">カード登録: 登録済み</p>
          )}
          {a.chargeStatus === "charged" && (
            <p className="text-xs text-teal-600">請求済み: {(a.chargedAmount ?? 0).toLocaleString()}円</p>
          )}
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
      <div className="flex flex-col items-end gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-end gap-0.5">
          <button
            onClick={copyConfirmUrl}
            disabled={!a.token}
            title={a.token ? undefined : "確認URLが未発行のためコピーできません"}
            className={`px-3 py-1.5 rounded-lg border text-xs transition ${
              a.token ? "border-gray-200 text-gray-600 hover:bg-gray-50" : "border-gray-100 text-gray-300 cursor-not-allowed"
            }`}
          >
            URL コピー
          </button>
          {copyStatus === "success" && <span className="text-xs text-teal-600">コピーしました</span>}
          {copyStatus === "error" && <span className="text-xs text-red-600">コピーに失敗しました</span>}
          {!a.token && <span className="text-xs text-gray-400">確認URL未発行</span>}
        </div>
        {a.cancelPolicyApplied && (
          <Link
            href={`/clinic/appointments/${a.id}`}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs hover:bg-gray-50 transition"
          >
            キャンセル判定
          </Link>
        )}
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
            onClick={markCompleted}
            className="px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 text-xs hover:bg-teal-100 transition"
          >
            診察完了
          </button>
        )}
      </div>
    </div>
  );
}
