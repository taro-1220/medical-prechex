"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/clinic-auth";

type ClinicDetail = {
  clinic: {
    id: string; name: string; slug: string | null; phone: string | null;
    email: string | null; address: string | null; status: string;
    createdAt: string; updatedAt: string;
  };
  onboarding:       Record<string, unknown> | null;
  clinicProfile:    Record<string, unknown> | null;
  appointmentCount: number;
  patientCount:     number;
  emailSentCount:   number | null;
  lineSentCount:    number | null;
  lastLoginAt:      string | null;
  users:            Array<{ user_id: string; role: string; updated_at: string }>;
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
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

  const { clinic, onboarding, clinicProfile, appointmentCount, patientCount, emailSentCount, lineSentCount, lastLoginAt } = detail;
  const activatedAt = (onboarding?.activated_at ?? clinicProfile?.activated_at) as string | null ?? null;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/ops" className="text-gray-400 text-sm hover:text-gray-700 transition">← 医院一覧</Link>
        <h1 className="text-xl font-black text-gray-900 mt-1">{clinic.name}</h1>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* 基本情報 */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">基本情報</p>
          <InfoRow label="医院名"    value={clinic.name} />
          <InfoRow label="ステータス" value={clinic.status} />
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
              { label: "予約数",    value: appointmentCount, measured: true },
              { label: "患者数",    value: patientCount,     measured: true },
              { label: "メール送信", value: emailSentCount,  measured: emailSentCount !== null },
              { label: "LINE送信",  value: lineSentCount,   measured: lineSentCount !== null },
            ].map(s => (
              <div key={s.label} className="text-center border border-gray-100 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                {s.measured
                  ? <p className="text-2xl font-black text-gray-900">{s.value}</p>
                  : <p className="text-sm text-gray-300">未計測</p>
                }
              </div>
            ))}
          </div>
        </div>

        {/* ログイン情報 */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">ログイン情報</p>
          <div className="flex gap-4">
            <span className="text-sm text-gray-400 w-32 shrink-0">最終ログイン</span>
            {lastLoginAt
              ? <span className="text-sm font-bold text-gray-900">{fmt(lastLoginAt)}</span>
              : <span className="text-sm text-gray-300">未取得</span>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
