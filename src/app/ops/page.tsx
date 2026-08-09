"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { getAccessToken } from "@/lib/clinic-auth";

type ClinicRow = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  createdAt: string;
  activatedAt: string | null;
  appointmentCount: number;
  confirmedCount: number;
  patientCount: number;
  lastAppointmentAt: string | null;
  lineSentCount: number;
  smsSentCount: number;
  emailSentCount: number;
};

type Summary = {
  totalClinics: number;
  activeClinics: number;
  pendingClinics: number;
  totalPatients: number;
  totalAppointments: number;
  confirmedAppointments: number;
  unconfirmedAppointments: number;
  lineSentCount: number;
  smsSentCount: number;
  emailSentCount: number;
  todayAppointments: number;
};

type RecentAppointment = { clinicName: string; appointmentAt: string; status: string; confirmed: boolean; createdAt: string };
type RecentClinic = { id: string; name: string; status: string; createdAt: string; activated: boolean };

const STATUS_FILTERS = ["all", "active", "pending", "paused", "cancelled"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const FILTER_LABEL: Record<StatusFilter, string> = {
  all: "すべて", active: "利用中", pending: "初期設定中", paused: "停止中", cancelled: "解約",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function OpsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [recentAppointments, setRecentAppointments] = useState<RecentAppointment[]>([]);
  const [recentClinics, setRecentClinics] = useState<RecentClinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) { setForbidden(true); setLoading(false); return; }
      try {
        const res = await fetch("/api/ops/clinics", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) { setForbidden(true); setLoading(false); return; }
        if (!res.ok) { setError(true); setLoading(false); return; }
        const data = await res.json();
        setSummary(data.summary);
        setClinics(data.clinics ?? []);
        setRecentAppointments(data.recentAppointments ?? []);
        setRecentClinics(data.recentClinics ?? []);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => clinics.filter(c => {
    if (query) {
      const q = query.toLowerCase();
      if (!c.name.toLowerCase().includes(q) &&
          !c.slug?.toLowerCase().includes(q)) return false;
    }
    if (statusFilter === "active")    return !!c.activatedAt;
    if (statusFilter === "pending")   return !c.activatedAt;
    if (statusFilter === "paused")    return c.status === "paused";
    if (statusFilter === "cancelled") return c.status === "cancelled";
    return true;
  }), [clinics, query, statusFilter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl font-black text-gray-900 mb-2">権限がありません</p>
          <p className="text-sm text-gray-500 mb-6">OPS管理画面へのアクセス権限がありません</p>
          <Link href="/clinic" className="text-teal-600 text-sm hover:underline">← クリニック画面へ</Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-3xl mb-3">⚠️</p>
          <p className="text-sm text-gray-500 mb-4">データの読み込みに失敗しました</p>
          <button onClick={() => location.reload()} className="text-teal-600 text-sm hover:underline">再試行</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-teal-600 uppercase tracking-widest">OPS</span>
          <h1 className="text-xl font-black text-gray-900 mt-0.5">運営管理画面</h1>
        </div>
        <Link href="/clinic" className="text-gray-400 text-sm hover:text-gray-700 transition">← クリニック画面</Link>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Summary */}
        {summary && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
              {[
                { label: "総医院数",   value: summary.totalClinics },
                { label: "利用中",     value: summary.activeClinics,    color: "text-teal-600" },
                { label: "初期設定中", value: summary.pendingClinics,   color: "text-amber-600" },
                { label: "総患者数",   value: summary.totalPatients },
                { label: "総予約数",   value: summary.totalAppointments, color: "text-blue-600" },
                { label: "今日の予約", value: summary.todayAppointments, color: "text-blue-600" },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                  <p className={`text-2xl font-black ${s.color ?? "text-gray-900"}`}>{s.value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              {[
                { label: "確認済み予約", value: summary.confirmedAppointments,   color: "text-teal-600" },
                { label: "未確認予約",   value: summary.unconfirmedAppointments, color: "text-amber-600" },
                { label: "確認率",       value: summary.totalAppointments > 0 ? `${Math.round(summary.confirmedAppointments / summary.totalAppointments * 100)}%` : "—" },
                { label: "LINE送信",    value: summary.lineSentCount },
                { label: "SMS送信",     value: summary.smsSentCount },
                { label: "メール送信",   value: summary.emailSentCount },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                  <p className={`text-2xl font-black ${s.color ?? "text-gray-900"}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* 直近の予約・直近の医院登録 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">直近の予約</p>
                {recentAppointments.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">予約はまだありません</p>
                ) : (
                  <ul className="space-y-2">
                    {recentAppointments.map((r, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-bold text-gray-800 truncate">{r.clinicName}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.confirmed ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"}`}>
                            {r.confirmed ? "確認済" : "未確認"}
                          </span>
                          <span className="text-gray-400 text-xs whitespace-nowrap">{fmt(r.appointmentAt)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">直近の医院登録</p>
                {recentClinics.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">医院はまだありません</p>
                ) : (
                  <ul className="space-y-2">
                    {recentClinics.map(r => (
                      <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                        <Link href={`/ops/clinics/${r.id}`} className="font-bold text-gray-800 truncate hover:text-teal-600">{r.name}</Link>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.activated ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"}`}>
                            {r.activated ? "利用中" : "初期設定中"}
                          </span>
                          <span className="text-gray-400 text-xs whitespace-nowrap">{fmt(r.createdAt)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="医院名・slugで検索"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-teal-500"
          />
          <div className="flex gap-1 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition ${statusFilter === f ? "bg-teal-600 text-white" : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"}`}
              >
                {FILTER_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-100">
                {["医院名", "slug", "ステータス", "利用状態", "患者数", "予約数", "確認済", "最終予約", "作成日", ""].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-xs font-bold text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-bold text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs whitespace-nowrap">{c.slug ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500">{c.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    {c.activatedAt
                      ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-700">利用中</span>
                      : <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">初期設定中</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-center">{c.patientCount}</td>
                  <td className="px-4 py-3 text-gray-700 text-center">{c.appointmentCount}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-teal-700 font-bold">{c.confirmedCount}</span>
                    <span className="text-gray-300">/{c.appointmentCount}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{c.lastAppointmentAt ? fmt(c.lastAppointmentAt) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmt(c.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/ops/clinics/${c.id}`} className="text-xs text-teal-600 hover:underline whitespace-nowrap">詳細 →</Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-400 text-sm">該当する医院がありません</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
