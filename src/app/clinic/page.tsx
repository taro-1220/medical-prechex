"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Appointment, AppointmentStatus, Clinic, ClinicProfile, ChargeDashboardResponse } from "@/lib/types";
import { getCurrentUser, getUserClinics, getCurrentClinic, getAccessToken, redirectToLogin, getClinicApprovalRedirect, isStripePendingBannerVisibleOnDashboard } from "@/lib/clinic-auth";
import OnboardingGuide, { GUIDE_KEY } from "./OnboardingGuide";
import StripePendingBanner from "./StripePendingBanner";
import StaffHeaderBar from "@/components/StaffHeaderBar";

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const isConfirmed = (s: AppointmentStatus) => s === "confirmed" || s === "ticket_issued";
const isVisited = (s: AppointmentStatus) => s === "checked_in";
const isCancelled = (s: AppointmentStatus) => s === "cancelled" || s === "expired";

/** 母数が小さい率は誤解を招きやすいため件数を併記する（Phase J セクションC） */
function formatRate(rate: number, numerator: number, denominator: number): string {
  const pct = `${(rate * 100).toFixed(1)}%`;
  return denominator < 10 ? `${pct}（${numerator}/${denominator}件）` : pct;
}

/** Phase J セクションC: 一覧の「要対応」判定。時系列より上に固定表示する対象を決める */
function attentionReasons(a: Appointment): string[] {
  const reasons: string[] = [];
  if (a.cardRegistrationRequired && !a.stripePaymentMethodId && !isCancelled(a.status) && a.status !== "completed") {
    reasons.push("カード未登録");
  }
  if (a.chargeStatus === "failed") reasons.push("請求失敗");
  if (a.chargeStatus === "requires_action") reasons.push("要再認証");
  return reasons;
}

export default function ClinicPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [clinic, setClinic]   = useState<Clinic | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [activatedAt, setActivatedAt] = useState<string | null | undefined>(undefined);
  const [profile, setProfile] = useState<ClinicProfile | null>(null);
  const [dashboard, setDashboard] = useState<ChargeDashboardResponse | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(GUIDE_KEY)) {
      setShowGuide(true);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (!user) { redirectToLogin(router); return; }
      const cs = await getUserClinics();
      if (cs.length === 0) { router.replace("/clinic/create"); return; }
      const current = await getCurrentClinic();
      const activeClinic = current ?? cs[0];
      const approvalRedirect = getClinicApprovalRedirect(activeClinic.status);
      if (approvalRedirect) { router.replace(approvalRedirect); return; }
      setClinics(cs);
      setClinic(activeClinic);
      const cid = activeClinic.id;
      const token = await getAccessToken();
      const obRes = await fetch(`/api/clinic/onboarding?clinic_id=${cid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (obRes.ok) {
        const { progress, profile: prof } = await obRes.json();
        setActivatedAt(progress?.activatedAt ?? null);
        setProfile(prof ?? null);
      } else {
        setActivatedAt(null);
      }
    })();
  }, [router]);

  const load = async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/appointments", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) { setAppointments([]); return; }
      const data = await res.json();
      setAppointments(Array.isArray(data) ? data : []);
    } catch {
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!clinic) return;
    (async () => {
      const token = await getAccessToken();
      const res = await fetch(`/api/clinic/dashboard?clinic_id=${clinic.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.ok) setDashboard(await res.json());
    })();
  }, [clinic]);

  const sorted = [...appointments].sort((a, b) => {
    const diff = new Date(a.appointmentAt).getTime() - new Date(b.appointmentAt).getTime();
    if (diff !== 0) return diff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Phase J セクションC: 要対応の予約を時系列より上に固定表示する
  const needsAttention = sorted.filter((a) => attentionReasons(a).length > 0);

  const markCompleted = async (token: string) => {
    await fetch(`/api/appointments/${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    load();
  };

  const markCheckedIn = async (token: string) => {
    await fetch(`/api/appointments/${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "checked_in" }),
    });
    load();
  };

  const today = new Date().toDateString();
  const summary = {
    today: appointments.filter(a => new Date(a.appointmentAt).toDateString() === today).length,
    pending: appointments.filter(a => a.status === "confirmation_pending").length,
    confirmed: appointments.filter(a => isConfirmed(a.status)).length,
    visited: appointments.filter(a => isVisited(a.status)).length,
    cancelled: appointments.filter(a => isCancelled(a.status)).length,
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <Link href="/" className="text-gray-400 text-sm hover:text-gray-900 transition">← medipre</Link>
          <h1 className="text-xl font-black mt-1 text-gray-900">{clinic?.name ?? "クリニック管理画面"}</h1>
          {clinics.length > 1 && (
            <select
              value={clinic?.id ?? ""}
              onChange={async e => {
                const c = clinics.find(x => x.id === e.target.value);
                if (!c) return;
                const token = await getAccessToken();
                await fetch("/api/clinic/select", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ clinicId: c.id }),
                });
                setClinic(c);
              }}
              className="mt-1 text-sm border border-gray-200 rounded-lg px-2 py-1 text-gray-700"
            >
              {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGuide(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 text-sm hover:bg-gray-100 transition"
            title="使い方ガイド"
          >
            ?
          </button>
          <Link href="/clinic/patients" className="px-4 py-2 rounded-xl border border-gray-200 font-bold text-sm text-gray-600 hover:bg-gray-50 transition">
            患者一覧
          </Link>
          <Link href="/clinic/templates" className="px-4 py-2 rounded-xl border border-gray-200 font-bold text-sm text-gray-600 hover:bg-gray-50 transition">
            テンプレート設定
          </Link>
          <Link href="/clinic/onboarding?mode=settings" className="px-4 py-2 rounded-xl border border-gray-200 font-bold text-sm text-gray-600 hover:bg-gray-50 transition">
            医院設定
          </Link>
          <Link href="/clinic/checkin" className="px-4 py-2 bg-emerald-600 rounded-xl font-bold text-sm text-white hover:bg-emerald-700 transition">
            QR受付
          </Link>
          <Link href="/clinic/new" className="px-4 py-2 bg-teal-600 rounded-xl font-bold text-sm text-white hover:bg-teal-700 transition">
            ＋ 新規予約
          </Link>
          <StaffHeaderBar />
        </div>
      </header>
      {showGuide && <OnboardingGuide onClose={() => setShowGuide(false)} />}
      {clinic && isStripePendingBannerVisibleOnDashboard(activatedAt, profile?.stripeAccountStatus) && (
        <StripePendingBanner clinicId={clinic.id} />
      )}
      {activatedAt === null && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center justify-between">
          <p className="text-sm text-amber-800 font-medium">初期設定が完了していません</p>
          <Link href="/clinic/onboarding" className="px-4 py-1.5 bg-amber-500 rounded-lg text-white text-sm font-bold hover:bg-amber-600 transition">
            初期設定へ
          </Link>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          {[
            { label: "本日の予約", value: summary.today },
            { label: "確認待ち", value: summary.pending, color: "text-yellow-600" },
            { label: "確認済", value: summary.confirmed, color: "text-teal-600" },
            { label: "来院済", value: summary.visited, color: "text-emerald-600" },
            { label: "キャンセル", value: summary.cancelled, color: "text-gray-400" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4 text-center">
              <p className="text-sm text-gray-500 mb-1">{s.label}</p>
              <p className={`text-3xl font-black ${s.color ?? "text-gray-900"}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* MVP+2 C-5 / Phase J セクションC: キャンセル料管理ダッシュボード（表示文言のみ変更。キャンセル料回収→キャンセル料管理） */}
        {dashboard && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-700">キャンセル料管理（{dashboard.month}）</h2>
            </div>

            {/* 主指標: キャンセル料 */}
            <div className="mb-5">
              <p className="text-xs text-gray-400">キャンセル料</p>
              <p className="text-4xl font-black text-teal-600">{dashboard.collectedAmount.toLocaleString()}円</p>
              <p className="text-xs text-gray-400 mt-0.5">{dashboard.collectedCount}件</p>
            </div>

            {/* 従属指標 */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-400">キャンセル率</p>
                <p className="text-lg font-bold text-gray-900">{formatRate(dashboard.cancelRate, dashboard.cancelledCount, dashboard.totalAppointments)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">無断件数</p>
                <p className="text-lg font-bold text-gray-900">{dashboard.noShowCount}件</p>
              </div>
              {/* Phase K-D: カード拒否とシステムエラーを分離表示（医院が拒否と誤認しないため） */}
              <div>
                <p className="text-xs text-gray-400">課金失敗</p>
                <p className={`text-lg font-bold ${dashboard.failedChargeCount > 0 ? "text-red-600" : "text-gray-900"}`}>{dashboard.failedChargeCount}件</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">システムエラー</p>
                <p className={`text-lg font-bold ${dashboard.systemErrorCount > 0 ? "text-amber-600" : "text-gray-900"}`}>{dashboard.systemErrorCount}件</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">同意済み予約のキャンセル率</p>
                <p className="text-lg font-bold text-gray-900">{formatRate(dashboard.policyAppliedCancelRate, dashboard.policyAppliedCancelledCount, dashboard.policyAppliedTotal)}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              対象外予約のキャンセル率: {formatRate(dashboard.policyNotAppliedCancelRate, dashboard.policyNotAppliedCancelledCount, dashboard.policyNotAppliedTotal)}
            </p>
          </div>
        )}

        {/* Phase J セクションC: 要対応（カード未登録／請求失敗／要再認証）を時系列より上に固定表示 */}
        {needsAttention.length > 0 && (
          <div className="mb-10">
            <h2 className="text-base font-bold mb-4 text-red-700">⚠ 要対応（{needsAttention.length}件）</h2>
            <div className="space-y-2">
              {needsAttention.map((a) => (
                <div key={a.id} className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                        {attentionReasons(a).join("・")}
                      </span>
                      <span className="text-xs text-gray-500">{formatDate(a.appointmentAt)}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-900 mt-0.5 truncate">{a.patientName}</p>
                  </div>
                  <Link
                    href={`/clinic/appointments/${a.id}`}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 text-xs font-bold hover:bg-red-100 transition"
                  >
                    確認する
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* List */}
        <h2 className="text-base font-bold mb-4 text-gray-700">予約一覧</h2>
        {loading ? (
          <p className="text-gray-400 text-sm">読み込み中...</p>
        ) : appointments.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p>予約はまだありません</p>
            <Link href="/clinic/new" className="mt-4 inline-block text-teal-600 text-sm hover:underline">
              新規予約を作成する
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((a) => (
              <div key={a.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 flex items-start justify-between gap-4">
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
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button
                    onClick={() => navigator.clipboard.writeText(`${location.origin}/confirm/${a.token}`)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs hover:bg-gray-50 transition"
                  >
                    URL コピー
                  </button>
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
                      onClick={() => markCompleted(a.token)}
                      className="px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 text-xs hover:bg-teal-100 transition"
                    >
                      診察完了
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
