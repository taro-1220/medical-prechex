"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AppointmentStatus, PatientListItem } from "@/lib/types";
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

function formatDate(iso: string | null) {
  if (!iso) return "予約なし";
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function ClinicPatientsPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(false);
    try {
      const token = await getAccessToken();
      if (!token) { redirectToLogin(router); return; }
      const res = await fetch(`/api/clinic/patients?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError(true); setPatients([]); return; }
      const data = await res.json();
      setPatients(Array.isArray(data) ? data : []);
    } catch {
      setError(true);
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (!user) { redirectToLogin(router); return; }
      load("");
    })();
  }, [router, load]);

  // 検索入力のデバウンス
  useEffect(() => {
    const t = setTimeout(() => { load(query); }, 300);
    return () => clearTimeout(t);
  }, [query, load]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <Link href="/clinic" className="text-sm text-gray-400 hover:text-gray-600 transition">← ダッシュボード</Link>
          <h1 className="text-lg font-black text-gray-900">患者一覧</h1>
        </div>
        <Link href="/clinic/new" className="px-4 py-2 bg-teal-600 rounded-xl font-bold text-sm text-white hover:bg-teal-700 transition">
          ＋ 新規予約
        </Link>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="氏名・電話番号・メールで検索"
            className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-teal-500 transition text-sm"
          />
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm">読み込み中...</p>
        ) : error ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-3xl mb-3">⚠️</p>
            <p>患者一覧の読み込みに失敗しました</p>
            <button onClick={() => load(query)} className="mt-4 text-teal-600 text-sm hover:underline">再試行</button>
          </div>
        ) : patients.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🧑‍⚕️</p>
            <p>{query ? "該当する患者がいません" : "患者はまだいません"}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {patients.map(p => (
              <Link
                key={p.id}
                href={`/clinic/patients/${p.id}`}
                className="block rounded-2xl border border-gray-200 bg-white shadow-sm p-5 hover:border-teal-300 transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-bold text-gray-900 break-words">{p.name}</p>
                      {p.latestStatus && (
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${STATUS_COLOR[p.latestStatus]}`}>
                          {STATUS_LABEL[p.latestStatus]}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                      <span className="text-xs text-gray-500 break-all">
                        {p.phone ? p.phone : <span className="text-gray-400">電話未登録</span>}
                      </span>
                      <span className="text-xs text-gray-500 break-all">
                        {p.email ? p.email : <span className="text-gray-400">メール未登録</span>}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400">最終予約</p>
                    <p className="text-sm text-gray-700">{formatDate(p.lastAppointmentAt)}</p>
                    <p className="text-xs text-gray-400 mt-1">予約 {p.appointmentCount} 件</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
