"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { getAccessToken } from "@/lib/clinic-auth";

type ClinicRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  createdAt: string;
  activatedAt: string | null;
  appointmentCount: number;
  patientCount: number;
  emailSentCount: number | null;
  lineSentCount: number | null;
  lastLoginAt: string | null;
};

type Summary = {
  totalClinics: number;
  activeClinics: number;
  pendingClinics: number;
  todayAppointments: number;
  todayEmailSent: number;
  todayLineSent: number;
};

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
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) { setForbidden(true); setLoading(false); return; }
      const res = await fetch("/api/ops/clinics", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) { setForbidden(true); setLoading(false); return; }
      const data = await res.json();
      setSummary(data.summary);
      setClinics(data.clinics ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => clinics.filter(c => {
    if (query) {
      const q = query.toLowerCase();
      if (!c.name.toLowerCase().includes(q) &&
          !c.email?.toLowerCase().includes(q) &&
          !c.phone?.toLowerCase().includes(q)) return false;
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {[
              { label: "総医院数",       value: summary.totalClinics },
              { label: "利用中",         value: summary.activeClinics,    color: "text-teal-600" },
              { label: "初期設定中",     value: summary.pendingClinics,   color: "text-amber-600" },
              { label: "今日の予約",     value: summary.todayAppointments, color: "text-blue-600" },
              { label: "今日のメール",   value: summary.todayEmailSent },
              { label: "今日のLINE",    value: summary.todayLineSent },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                <p className={`text-2xl font-black ${s.color ?? "text-gray-900"}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="医院名・メール・電話番号で検索"
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
                {["医院名", "ステータス", "利用状態", "最終ログイン", "予約数", "患者数", "メール", "LINE", "作成日", ""].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-xs font-bold text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">{c.name}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500">{c.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    {c.activatedAt
                      ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-700">利用中</span>
                      : <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">初期設定中</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{c.lastLoginAt ? fmt(c.lastLoginAt) : <span className="text-gray-300">未取得</span>}</td>
                  <td className="px-4 py-3 text-gray-700 text-center">{c.appointmentCount}</td>
                  <td className="px-4 py-3 text-gray-700 text-center">{c.patientCount}</td>
                  <td className="px-4 py-3 text-gray-400 text-center">{c.emailSentCount ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-400 text-center">{c.lineSentCount ?? "—"}</td>
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
