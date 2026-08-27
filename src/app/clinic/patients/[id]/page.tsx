"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import type { AppointmentStatus, PatientDetail } from "@/lib/types";
import { getCurrentUser, getAccessToken, redirectToLogin } from "@/lib/clinic-auth";

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

function fmt(iso: string | null | undefined, withTime = true) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", withTime
    ? { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "numeric", day: "numeric" });
}

type LoadState = "loading" | "ok" | "notfound" | "error";

export default function ClinicPatientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);
  const [state, setState] = useState<LoadState>("loading");
  const [detail, setDetail] = useState<PatientDetail | null>(null);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (!user) { redirectToLogin(router); return; }
      try {
        const token = await getAccessToken();
        if (!token) { redirectToLogin(router); return; }
        const res = await fetch(`/api/clinic/patients/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 404) { setState("notfound"); return; }
        if (!res.ok) { setState("error"); return; }
        setDetail(await res.json());
        setState("ok");
      } catch {
        setState("error");
      }
    })();
  }, [id, router]);

  const SentBadges = ({ line, sms, email }: { line?: string; sms?: string; email?: string }) => {
    const items = [line && "LINE", sms && "SMS", email && "メール"].filter(Boolean) as string[];
    if (items.length === 0) return <span className="text-xs text-gray-400">送信記録なし</span>;
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">
        送信済み（{items.join("・")}）
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <Link href="/clinic/patients" className="text-sm text-gray-400 hover:text-gray-600 transition">← 患者一覧へ戻る</Link>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {state === "loading" && <p className="text-gray-400 text-sm">読み込み中...</p>}

        {state === "notfound" && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">🔍</p>
            <p>患者が見つかりません</p>
            <p className="text-xs text-gray-400 mt-1">存在しないか、自院の患者ではありません</p>
            <Link href="/clinic/patients" className="mt-4 inline-block text-teal-600 text-sm hover:underline">患者一覧へ戻る</Link>
          </div>
        )}

        {state === "error" && (
          <div className="text-center py-20 text-gray-500">
            <p className="text-3xl mb-3">⚠️</p>
            <p>読み込みに失敗しました</p>
            <button onClick={() => location.reload()} className="mt-4 text-teal-600 text-sm hover:underline">再試行</button>
          </div>
        )}

        {state === "ok" && detail && (
          <div className="space-y-8">
            {/* 基本情報 */}
            <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
              <h1 className="text-xl font-black text-gray-900 break-words mb-4">{detail.patient.name}</h1>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-gray-400">電話番号</dt>
                  <dd className="text-gray-800 break-all">{detail.patient.phone || <span className="text-gray-400">未登録</span>}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">メール</dt>
                  <dd className="text-gray-800 break-all">{detail.patient.email || <span className="text-gray-400">未登録</span>}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">登録日時</dt>
                  <dd className="text-gray-800">{fmt(detail.patient.createdAt)}</dd>
                </div>
              </dl>
            </section>

            {/* 予約履歴 */}
            <section>
              <h2 className="text-base font-bold text-gray-700 mb-3">予約履歴（{detail.appointments.length}件）</h2>
              {detail.appointments.length === 0 ? (
                <p className="text-sm text-gray-400 rounded-2xl border border-dashed border-gray-200 py-8 text-center">予約はありません</p>
              ) : (
                <div className="space-y-3">
                  {detail.appointments.map(a => (
                    <div key={a.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${STATUS_COLOR[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                        <span className="text-sm font-bold text-gray-900">{fmt(a.appointmentAt)}</span>
                        {a.description && <span className="text-xs text-gray-500 break-words">{a.description}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span>患者確認: {a.consentAt ? fmt(a.consentAt) : "未確認"}</span>
                        <SentBadges line={a.lineSentAt} sms={a.smsSentAt} email={a.emailSentAt} />
                        {a.cancelledAt && <span className="text-gray-400">キャンセル: {fmt(a.cancelledAt)}</span>}
                      </div>
                      {a.cancellationPolicy && (
                        <details className="mt-2">
                          <summary className="text-xs text-teal-600 cursor-pointer">確認ポリシー</summary>
                          <p className="text-xs text-gray-600 whitespace-pre-wrap mt-1 leading-relaxed">{a.cancellationPolicy}</p>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 同意履歴 */}
            <section>
              <h2 className="text-base font-bold text-gray-700 mb-3">同意履歴（{detail.consents.length}件）</h2>
              {detail.consents.length === 0 ? (
                <p className="text-sm text-gray-400 rounded-2xl border border-dashed border-gray-200 py-8 text-center">同意記録はありません</p>
              ) : (
                <div className="space-y-3">
                  {detail.consents.map(c => (
                    <div key={c.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
                      <div className="flex items-center gap-3 flex-wrap mb-1">
                        <span className="text-sm font-bold text-gray-900">同意日時: {fmt(c.consentedAt)}</span>
                        <span className="text-xs text-gray-500">対象予約: {fmt(c.appointmentAt)}</span>
                      </div>
                      <details className="mt-1">
                        <summary className="text-xs text-teal-600 cursor-pointer">同意した文面（スナップショット）</summary>
                        <p className="text-xs text-gray-600 whitespace-pre-wrap mt-1 leading-relaxed">{c.policyText}</p>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
