"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Appointment, Clinic, ClinicProfile, ChargeDashboardResponse } from "@/lib/types";
import { getCurrentUser, getUserClinics, getCurrentClinic, getAccessToken, redirectToLogin, getClinicApprovalRedirect, isStripePendingBannerVisibleOnDashboard } from "@/lib/clinic-auth";
import { isTodayJst, matchesStatus } from "@/lib/clinic-appointments-view";
import OnboardingGuide, { GUIDE_KEY } from "./OnboardingGuide";
import StripePendingBanner from "./StripePendingBanner";
import { AppointmentRow, attentionReasons, formatDate } from "./AppointmentRow";

/** 母数が小さい率は誤解を招きやすいため件数を併記する（Phase J セクションC） */
function formatRate(rate: number, numerator: number, denominator: number): string {
  const pct = `${(rate * 100).toFixed(1)}%`;
  return denominator < 10 ? `${pct}（${numerator}/${denominator}件）` : pct;
}

/** /api/ops/meを呼び、isOpsAdminを返す。失敗時はnull（未確定）。 */
async function fetchIsOpsAdmin(token: string | null): Promise<boolean | null> {
  if (!token) return null;
  try {
    const res = await fetch("/api/ops/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.isOpsAdmin === "boolean" ? data.isOpsAdmin : null;
  } catch {
    return null;
  }
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
  const [guardResolved, setGuardResolved] = useState(false);

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
      if (cs.length === 0) {
        const isOpsAdmin = await fetchIsOpsAdmin(await getAccessToken());
        router.replace(isOpsAdmin === true ? "/ops" : "/clinic/create");
        return;
      }
      const current = await getCurrentClinic();
      const activeClinic = current ?? cs[0];
      const approvalRedirect = getClinicApprovalRedirect(activeClinic.status);
      if (approvalRedirect) { router.replace(approvalRedirect); return; }
      setGuardResolved(true);
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

  const nowIso = new Date().toISOString();
  const todaysAppointments = sorted.filter((a) => isTodayJst(a.appointmentAt, nowIso));
  const summary = {
    today: todaysAppointments.length,
    pending: appointments.filter(a => matchesStatus(a.status, "pending")).length,
    confirmed: appointments.filter(a => matchesStatus(a.status, "confirmed")).length,
    visited: appointments.filter(a => matchesStatus(a.status, "visited")).length,
    cancelled: appointments.filter(a => matchesStatus(a.status, "canceled")).length,
  };

  if (!guardResolved) {
    return <div className="min-h-screen bg-gray-50" />;
  }

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
                const selRes = await fetch("/api/clinic/select", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ clinicId: c.id }),
                });
                if (!selRes.ok) return;
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
            { label: "本日の予約", value: summary.today, href: "/clinic/appointments?range=today" },
            { label: "確認待ち", value: summary.pending, color: "text-yellow-600", href: "/clinic/appointments?range=all&status=pending" },
            { label: "確認済", value: summary.confirmed, color: "text-teal-600", href: "/clinic/appointments?range=all&status=confirmed" },
            { label: "来院済", value: summary.visited, color: "text-emerald-600", href: "/clinic/appointments?range=all&status=visited" },
            { label: "キャンセル", value: summary.cancelled, color: "text-gray-400", href: "/clinic/appointments?range=all&status=canceled" },
          ].map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4 text-center hover:-translate-y-0.5 hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <p className="text-sm text-gray-500 mb-1">{s.label}</p>
              <p className={`text-3xl font-black ${s.color ?? "text-gray-900"}`}>{s.value}</p>
            </Link>
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

        {/* List: 本日の予約のみ。全件は /clinic/appointments で見る */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-700">予約一覧（本日）</h2>
          <Link href="/clinic/appointments" className="text-sm text-teal-600 hover:underline">
            すべての予約を見る
          </Link>
        </div>
        {loading ? (
          <p className="text-gray-400 text-sm">読み込み中...</p>
        ) : todaysAppointments.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p>本日の予約はありません</p>
            <Link href="/clinic/appointments" className="mt-4 inline-block text-teal-600 text-sm hover:underline">
              すべての予約を見る
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {todaysAppointments.map((a) => (
              <AppointmentRow key={a.id} appointment={a} onChanged={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
