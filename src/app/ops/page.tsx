"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { getAccessToken, getCurrentUser, signOut } from "@/lib/clinic-auth";
import { getClinicStatusLabel } from "@/lib/status-labels";
import StaffHeaderBar from "@/components/StaffHeaderBar";
import DataTable, { type DataTableColumn, type DataTableFilterOption } from "@/components/ops/DataTable";

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
  directorName: string;
  contactEmail: string;
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

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// クリニック一覧のステータス絞り込み。activatedAtベースの2つ（利用中/初期設定中）と
// clinics.statusベースの2つ（停止中/解約）が混在している既存の挙動をそのまま維持する
// （paused/cancelledは現行のClinicStatus型には無い値のため、この絞り込みは常に空になる。
//  今回の載せ替えでは挙動を変えないため、この点も含めて据え置く）。
const CLINIC_FILTER_OPTIONS: DataTableFilterOption<ClinicRow>[] = [
  { value: "all", label: "すべて", predicate: () => true },
  { value: "active", label: "利用中", predicate: (c) => !!c.activatedAt },
  { value: "pending", label: "初期設定中", predicate: (c) => !c.activatedAt },
  { value: "paused", label: "停止中", predicate: (c) => c.status === "paused" },
  { value: "cancelled", label: "解約", predicate: (c) => c.status === "cancelled" },
];

const CLINIC_COLUMNS: DataTableColumn<ClinicRow>[] = [
  { key: "name", label: "医院名", render: (c) => <span className="font-bold text-gray-900">{c.name}</span> },
  { key: "slug", label: "slug", render: (c) => <span className="text-gray-400 font-mono text-xs whitespace-nowrap">{c.slug ?? "—"}</span> },
  {
    key: "status", label: "ステータス",
    render: (c) => <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500">{getClinicStatusLabel(c.status)}</span>,
  },
  {
    key: "activated", label: "利用状態",
    render: (c) => c.activatedAt
      ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-700">利用中</span>
      : <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">初期設定中</span>,
  },
  {
    key: "patientCount", label: "患者数", sortable: true, sortValue: (c) => c.patientCount,
    cellClassName: "text-gray-700 text-center", render: (c) => c.patientCount,
  },
  {
    key: "appointmentCount", label: "予約数", sortable: true, sortValue: (c) => c.appointmentCount,
    cellClassName: "text-gray-700 text-center", render: (c) => c.appointmentCount,
  },
  {
    key: "confirmedCount", label: "確認済", cellClassName: "text-center",
    render: (c) => <><span className="text-teal-700 font-bold">{c.confirmedCount}</span><span className="text-gray-300">/{c.appointmentCount}</span></>,
  },
  {
    key: "lastAppointmentAt", label: "最終予約", sortable: true, sortValue: (c) => c.lastAppointmentAt ?? "",
    cellClassName: "text-gray-500 whitespace-nowrap",
    render: (c) => c.lastAppointmentAt ? fmt(c.lastAppointmentAt) : <span className="text-gray-300">—</span>,
  },
  {
    key: "createdAt", label: "作成日", sortable: true, sortValue: (c) => c.createdAt,
    cellClassName: "text-gray-400 whitespace-nowrap", render: (c) => fmt(c.createdAt),
  },
  {
    key: "detail", label: "",
    render: (c) => <Link href={`/ops/clinics/${c.id}`} className="text-xs text-teal-600 hover:underline whitespace-nowrap">詳細 →</Link>,
  },
];

export default function OpsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [recentAppointments, setRecentAppointments] = useState<RecentAppointment[]>([]);
  const [recentClinics, setRecentClinics] = useState<RecentClinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [forbiddenEmail, setForbiddenEmail] = useState<string | null>(null);
  const [approvalActionId, setApprovalActionId] = useState<string | null>(null);

  const loadClinics = async () => {
    const token = await getAccessToken();
    if (!token) { setForbidden(true); setLoading(false); return; }
    try {
      const res = await fetch("/api/ops/clinics", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        const user = await getCurrentUser();
        setForbiddenEmail(user?.email ?? null);
        setForbidden(true);
        setLoading(false);
        return;
      }
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
  };

  useEffect(() => { loadClinics(); }, []);

  const pendingApprovalClinics = useMemo(
    () => clinics.filter(c => c.status === "pending_approval"),
    [clinics],
  );

  const handleApprove = async (clinicId: string) => {
    setApprovalActionId(clinicId);
    const token = await getAccessToken();
    await fetch(`/api/ops/clinics/${clinicId}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    await loadClinics();
    setApprovalActionId(null);
  };

  const handleReject = async (clinicId: string) => {
    if (!confirm("この医院を却下しますか？")) return;
    setApprovalActionId(clinicId);
    const token = await getAccessToken();
    await fetch(`/api/ops/clinics/${clinicId}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    await loadClinics();
    setApprovalActionId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-2xl font-black text-gray-900 mb-2">権限がありません</p>
          <p className="text-sm text-gray-500 mb-2">OPS管理画面へのアクセス権限がありません</p>
          {forbiddenEmail && (
            <p className="text-xs text-gray-400 mb-6">現在ログイン中：{forbiddenEmail}</p>
          )}
          <div className="flex flex-col items-center gap-3">
            {forbiddenEmail && (
              <button
                onClick={() => signOut()}
                className="px-4 py-2 bg-teal-600 rounded-lg text-white text-sm font-bold hover:bg-teal-700 transition"
              >
                ログアウトして、運営者アカウントでログインし直す
              </button>
            )}
            <Link href="/clinic" className="text-teal-600 text-sm hover:underline">← クリニック画面へ</Link>
          </div>
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
        <div className="flex items-center gap-4">
          <Link href="/clinic" className="text-gray-400 text-sm hover:text-gray-700 transition whitespace-nowrap">← クリニック画面</Link>
          <StaffHeaderBar />
        </div>
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

        {/* Phase P1: 承認待ちセクション */}
        {pendingApprovalClinics.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 shadow-sm p-5 mb-8">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700 mb-3">
              承認待ち（{pendingApprovalClinics.length}件）
            </p>
            <ul className="space-y-3">
              {pendingApprovalClinics.map(c => (
                <li key={c.id} className="bg-white rounded-xl border border-amber-100 p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-bold text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      院長: {c.directorName || "—"}　連絡先: {c.contactEmail || "—"}　申込日: {fmt(c.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(c.id)}
                      disabled={approvalActionId === c.id}
                      className="px-4 py-2 bg-teal-600 rounded-lg text-white text-sm font-bold hover:bg-teal-700 transition disabled:opacity-50"
                    >
                      {approvalActionId === c.id ? "処理中..." : "承認する"}
                    </button>
                    <button
                      onClick={() => handleReject(c.id)}
                      disabled={approvalActionId === c.id}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-bold hover:bg-gray-50 transition disabled:opacity-50"
                    >
                      却下する
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DataTable
          columns={CLINIC_COLUMNS}
          rows={clinics}
          rowKey={(c) => c.id}
          searchPlaceholder="医院名・slugで検索"
          searchPredicate={(c, q) => c.name.toLowerCase().includes(q) || (c.slug?.toLowerCase().includes(q) ?? false)}
          filterOptions={CLINIC_FILTER_OPTIONS}
          emptyMessage="該当する医院がありません"
          minWidthClassName="min-w-[900px]"
        />
      </div>
    </div>
  );
}
