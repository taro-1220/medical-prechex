"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/clinic-auth";
import { getAppointmentStatusLabel, getClinicStatusLabel } from "@/lib/status-labels";
import StaffHeaderBar from "@/components/StaffHeaderBar";

type OpsAppointment = {
  id: string; patientName: string; appointmentAt: string; status: string;
  description: string; confirmedAt: string | null;
  lineSentAt: string | null; smsSentAt: string | null; emailSentAt: string | null;
};

type ClinicDetail = {
  clinic: {
    id: string; name: string; slug: string | null; phone: string | null;
    email: string | null; address: string | null; status: string;
    createdAt: string; updatedAt: string;
  };
  onboarding:         Record<string, unknown> | null;
  clinicProfile:      Record<string, unknown> | null;
  cancellationPolicy: string | null;
  appointmentCount:   number;
  confirmedCount:     number;
  unconfirmedCount:   number;
  patientCount:       number;
  lineSentCount:      number;
  smsSentCount:       number;
  emailSentCount:     number;
  templateChannels:   string[];
  hasTemplates:       boolean;
  users:              Array<{ user_id: string; role: string }>;
  appointments:       OpsAppointment[];
};


const ROLE_LABEL: Record<string, string> = { owner: "オーナー", manager: "マネージャ", staff: "スタッフ" };

const CHANNEL_LABEL: Record<string, string> = { line: "LINE", sms: "SMS", email: "メール" };

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function SentBadges({ line, sms, email }: { line: string | null; sms: string | null; email: string | null }) {
  const items = [line && "LINE", sms && "SMS", email && "メール"].filter(Boolean) as string[];
  if (items.length === 0) return <span className="text-xs text-gray-400">送信記録なし</span>;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">
      送信済み（{items.join("・")}）
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4">
      <span className="text-sm text-gray-400 w-32 shrink-0">{label}</span>
      <span className="text-sm font-bold text-gray-900 break-all">{value}</span>
    </div>
  );
}

export default function OpsClinicDetailPage({ params }: { params: Promise<{ clinicId: string }> }) {
  const router = useRouter();
  const [detail, setDetail] = useState<ClinicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const { clinicId } = await params;
      const token = await getAccessToken();
      if (!token) { router.replace("/clinic"); return; }
      const res = await fetch(`/api/ops/clinics/${clinicId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) { router.replace("/clinic"); return; }
      if (!res.ok) { setNotFound(true); setLoading(false); return; }
      setDetail(await res.json());
      setLoading(false);
    })();
  }, [params, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  if (notFound || !detail) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">医院が見つかりません</p>
          <Link href="/ops" className="text-teal-600 text-sm hover:underline">← 医院一覧</Link>
        </div>
      </div>
    );
  }

  const {
    clinic, onboarding, clinicProfile, cancellationPolicy,
    appointmentCount, confirmedCount, unconfirmedCount, patientCount,
    lineSentCount, smsSentCount, emailSentCount, templateChannels, hasTemplates,
    users, appointments,
  } = detail;
  const activatedAt = (onboarding?.activated_at ?? clinicProfile?.activated_at) as string | null ?? null;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-start justify-between gap-4">
        <div>
          <Link href="/ops" className="text-gray-400 text-sm hover:text-gray-700 transition">← 医院一覧</Link>
          <h1 className="text-xl font-black text-gray-900 mt-1">{clinic.name}</h1>
        </div>
        <StaffHeaderBar mode="email" />
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* 基本情報 */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">基本情報</p>
          <InfoRow label="医院名"    value={clinic.name} />
          <InfoRow label="ステータス" value={getClinicStatusLabel(clinic.status)} />
          <InfoRow label="メール"    value={clinic.email ?? "—"} />
          <InfoRow label="電話番号"  value={clinic.phone ?? "—"} />
          <InfoRow label="住所"      value={clinic.address ?? "—"} />
          <InfoRow label="作成日"    value={fmt(clinic.createdAt)} />
          <InfoRow label="更新日"    value={fmt(clinic.updatedAt)} />
        </div>

        {/* 利用状態 */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">利用状態</p>
          <div className="flex items-center gap-3 mb-4">
            {activatedAt
              ? <span className="px-3 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-700">利用中</span>
              : <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">初期設定中</span>
            }
            {activatedAt && <span className="text-xs text-gray-400">利用開始: {fmt(activatedAt)}</span>}
          </div>
          {onboarding && (
            <div className="space-y-2 border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-400 font-bold mb-2">onboarding_progress</p>
              {Object.entries(onboarding)
                .filter(([k]) => !["id", "clinic_id"].includes(k))
                .map(([k, v]) => (
                  <InfoRow key={k} label={k} value={String(v ?? "—")} />
                ))}
            </div>
          )}
          {clinicProfile && (
            <div className="space-y-2 border-t border-gray-100 pt-4 mt-4">
              <p className="text-xs text-gray-400 font-bold mb-2">clinic_profile</p>
              {Object.entries(clinicProfile)
                .filter(([k]) => !["id", "clinic_id"].includes(k))
                .map(([k, v]) => (
                  <InfoRow key={k} label={k} value={String(v ?? "—")} />
                ))}
            </div>
          )}
        </div>

        {/* 利用指標 */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">利用指標</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "患者数",     value: patientCount },
              { label: "予約数",     value: appointmentCount },
              { label: "確認済み",   value: confirmedCount },
              { label: "未確認",     value: unconfirmedCount },
              { label: "確認率",     value: appointmentCount > 0 ? `${Math.round(confirmedCount / appointmentCount * 100)}%` : "—" },
              { label: "LINE送信",   value: lineSentCount },
              { label: "SMS送信",    value: smsSentCount },
              { label: "メール送信",  value: emailSentCount },
            ].map(s => (
              <div key={s.label} className="text-center border border-gray-100 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                <p className="text-2xl font-black text-gray-900">{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* テンプレート設定・キャンセルポリシー */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">運用設定</p>
          <div className="flex gap-4 items-center">
            <span className="text-sm text-gray-400 w-32 shrink-0">テンプレート</span>
            {hasTemplates
              ? <span className="text-sm font-bold text-gray-900">設定あり（{templateChannels.map(c => CHANNEL_LABEL[c] ?? c).join("・")}）</span>
              : <span className="text-sm text-gray-400">未設定（既定テンプレートを使用）</span>
            }
          </div>
          <div className="flex gap-4">
            <span className="text-sm text-gray-400 w-32 shrink-0">キャンセルポリシー</span>
            {cancellationPolicy
              ? <span className="text-sm text-gray-800 whitespace-pre-wrap break-words">{cancellationPolicy}</span>
              : <span className="text-sm text-gray-400">未設定</span>
            }
          </div>
        </div>

        {/* 所属ユーザー */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">所属ユーザー（{users.length}名）</p>
          {users.length === 0 ? (
            <p className="text-sm text-gray-400">ユーザーがいません</p>
          ) : (
            <ul className="space-y-2">
              {users.map(u => (
                <li key={u.user_id} className="flex items-center justify-between gap-3 text-sm border-b border-gray-50 pb-2 last:border-0">
                  <span className="font-mono text-xs text-gray-500 break-all">{u.user_id}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600 shrink-0">{ROLE_LABEL[u.role] ?? u.role}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 予約履歴 */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">予約履歴（{appointments.length}件）</p>
          {appointments.length === 0 ? (
            <p className="text-sm text-gray-400 rounded-2xl border border-dashed border-gray-200 py-8 text-center">予約はありません</p>
          ) : (
            <div className="space-y-3">
              {appointments.map(a => (
                <div key={a.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${a.confirmedAt ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"}`}>
                      {a.confirmedAt ? "確認済" : "未確認"}
                    </span>
                    <span className="text-xs text-gray-500">{getAppointmentStatusLabel(a.status)}</span>
                    <span className="text-sm font-bold text-gray-900">{fmt(a.appointmentAt)}</span>
                    <span className="text-sm text-gray-700 break-words">{a.patientName}</span>
                    {a.description && <span className="text-xs text-gray-400 break-words">{a.description}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>患者確認: {a.confirmedAt ? fmt(a.confirmedAt) : "未確認"}</span>
                    <SentBadges line={a.lineSentAt} sms={a.smsSentAt} email={a.emailSentAt} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
