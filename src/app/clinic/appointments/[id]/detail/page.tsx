"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import type { Appointment, AppointmentStatus, TreatmentCategory } from "@/lib/types";
import { getAccessToken, redirectToLogin } from "@/lib/clinic-auth";
import { useClinicGuard } from "@/lib/useClinicGuard";
import { shouldRenderClinicContent } from "@/lib/clinic-guard";
import { formatJstDateTime } from "@/lib/datetime-display";

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

const TREATMENT_CATEGORY_LABEL: Record<TreatmentCategory, string> = {
  private: "自由診療",
  insurance: "保険診療",
  other: "その他",
};

function formatDate(iso: string) {
  return formatJstDateTime(iso, { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

type LoadState = "loading" | "ok" | "notfound" | "error";

export default function ClinicAppointmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);
  const { state: guardState, clinic } = useClinicGuard(router);
  const [state, setState] = useState<LoadState>("loading");
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"success" | "error" | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSendError, setEmailSendError] = useState<string | null>(null);

  const load = async () => {
    try {
      const token = await getAccessToken();
      if (!token) { redirectToLogin(router); return; }
      const res = await fetch(`/api/clinic/appointments/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // 他院の予約も存在しない予約と同じ扱いにする（存在を知らせない）
      if (res.status === 404 || res.status === 403) { setState("notfound"); return; }
      if (!res.ok) { setState("error"); return; }
      setAppt(await res.json());
      setState("ok");
    } catch {
      setState("error");
    }
  };

  useEffect(() => {
    if (guardState !== "ok" || !clinic) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardState, clinic, id, router]);

  const copyConfirmUrl = async () => {
    if (!appt?.token) return;
    try {
      await navigator.clipboard.writeText(`${location.origin}/confirm/${appt.token}`);
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
    }
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const sendConfirmEmail = async () => {
    if (emailSending) return;
    setEmailSending(true);
    setEmailSendError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/clinic/appointments/${id}/send-confirm-email`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const body = await res.json().catch(() => ({}));
      if (body.ok) {
        await load();
      } else if (body.reason === "disabled") {
        setEmailSendError("メール送信は現在無効です");
      } else if (body.reason === "no_email") {
        setEmailSendError("連絡先が登録されていません");
      } else {
        setEmailSendError("送信に失敗しました。再送できます");
      }
    } catch {
      setEmailSendError("送信に失敗しました。再送できます");
    } finally {
      setEmailSending(false);
    }
  };

  const runAction = async (action: "checkin" | "complete") => {
    if (!appt) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/appointments/${appt.token}/${action}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.ok) {
        await load();
      } else {
        const body = await res.json().catch(() => ({}));
        if (body.error === "invalid_status") {
          const current = body.current as AppointmentStatus | undefined;
          setActionError(`現在の状態（${current ? STATUS_LABEL[current] ?? current : "不明"}）のため実行できません`);
        } else {
          setActionError("操作に失敗しました");
        }
      }
    } catch {
      setActionError("操作に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  if (!shouldRenderClinicContent(guardState)) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/clinic" className="text-gray-400 text-sm hover:text-gray-900 transition">← 予約一覧</Link>
        <h1 className="text-xl font-black text-gray-900 mt-1">予約詳細</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {state === "loading" && <p className="text-gray-400 text-sm">読み込み中...</p>}

        {state === "notfound" && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">🔍</p>
            <p>予約が見つかりません</p>
            <p className="text-xs text-gray-400 mt-1">存在しないか、自院の予約ではありません</p>
            <Link href="/clinic" className="mt-4 inline-block text-teal-600 text-sm hover:underline">← 予約一覧へ戻る</Link>
          </div>
        )}

        {state === "error" && (
          <div className="text-center py-20 text-gray-500">
            <p className="text-3xl mb-3">⚠️</p>
            <p>読み込みに失敗しました</p>
            <button onClick={() => location.reload()} className="mt-4 text-teal-600 text-sm hover:underline">再試行</button>
          </div>
        )}

        {state === "ok" && appt && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-5">
            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${STATUS_COLOR[appt.status]}`}>
              {STATUS_LABEL[appt.status]}
            </span>

            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-gray-400">予約日時</dt>
                <dd className="font-bold text-gray-900">{formatDate(appt.appointmentAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">患者名</dt>
                <dd className="font-bold text-gray-900">
                  {appt.patientId ? (
                    <Link href={`/clinic/patients/${appt.patientId}`} className="text-teal-600 hover:underline">
                      {appt.patientName}
                    </Link>
                  ) : (
                    appt.patientName
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">診療区分</dt>
                <dd className="text-gray-800">{TREATMENT_CATEGORY_LABEL[appt.treatmentCategory]}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">キャンセルポリシー同意</dt>
                <dd className="text-gray-800">
                  {!appt.cancelPolicyApplied
                    ? "対象外"
                    : appt.cancelPolicyAgreedAt
                      ? `同意済み（${formatDate(appt.cancelPolicyAgreedAt)}）`
                      : "未同意"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">確認URL</dt>
                <dd className="flex items-center gap-2 flex-wrap mt-0.5">
                  <button
                    onClick={copyConfirmUrl}
                    disabled={!appt.token}
                    title={appt.token ? undefined : "確認URLが未発行のためコピーできません"}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    URL コピー
                  </button>
                  {copyStatus === "success" && <span className="text-xs text-teal-600">コピーしました</span>}
                  {copyStatus === "error" && <span className="text-xs text-red-600">コピーに失敗しました</span>}
                  {!appt.token && <span className="text-xs text-gray-400">確認URL未発行</span>}
                  <span className="text-xs text-gray-400">
                    {(() => {
                      const sentChannels = [appt.lineSentAt && "LINE", appt.smsSentAt && "SMS", appt.emailSentAt && "メール"].filter(Boolean);
                      return sentChannels.length ? `送信済み（${sentChannels.join("・")}）` : "未送信";
                    })()}
                  </span>
                </dd>
                <dd className="flex items-center gap-2 flex-wrap mt-1.5">
                  {(() => {
                    const email = appt.patientRegisteredEmail || appt.email;
                    if (!email) return <span className="text-xs text-gray-400">連絡先なし</span>;
                    return (
                      <>
                        <button
                          onClick={sendConfirmEmail}
                          disabled={emailSending}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs hover:bg-gray-50 transition disabled:opacity-50"
                        >
                          {emailSending ? "送信中..." : "メールで送る"}
                        </button>
                        <span className="text-xs text-gray-400">
                          {appt.emailSentAt ? `メール送信済み ${formatDate(appt.emailSentAt)}` : "メール未送信"}
                        </span>
                        {appt.patientRegisteredEmail && (
                          <span className="text-xs text-teal-600">患者さんが登録</span>
                        )}
                      </>
                    );
                  })()}
                </dd>
                {emailSendError && <dd className="text-xs text-red-600 mt-1">{emailSendError}</dd>}
                {!appt.emailSentAt && appt.emailLastFailedAt && (
                  <dd className="text-xs text-red-600 mt-1">メール送信に失敗しました（{formatDate(appt.emailLastFailedAt)}）</dd>
                )}
              </div>
            </dl>

            {appt.cancelPolicyApplied && (
              <Link
                href={`/clinic/appointments/${appt.id}`}
                className="inline-block px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs hover:bg-gray-50 transition"
              >
                キャンセル判定へ
              </Link>
            )}

            {actionError && <p className="text-sm text-red-600">{actionError}</p>}

            {(appt.status === "confirmed" || appt.status === "checked_in") && (
              <div className="flex gap-3 pt-1">
                {appt.status === "confirmed" && (
                  <button
                    onClick={() => runAction("checkin")}
                    disabled={submitting}
                    className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-bold hover:bg-emerald-100 transition disabled:opacity-50"
                  >
                    受付
                  </button>
                )}
                {appt.status === "checked_in" && (
                  <button
                    onClick={() => runAction("complete")}
                    disabled={submitting}
                    className="px-4 py-2 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 text-sm font-bold hover:bg-teal-100 transition disabled:opacity-50"
                  >
                    完了
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
