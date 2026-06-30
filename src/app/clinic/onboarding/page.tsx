"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken, getCurrentClinic } from "@/lib/clinic-auth";
import type { ClinicProfile, OnboardingProgress } from "@/lib/types";

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";
const labelCls = "block text-xs text-gray-500 mb-1";

export default function OnboardingPage() {
  const router = useRouter();
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [profile, setProfile] = useState<ClinicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pf, setPf] = useState({ clinicDisplayName: "", directorName: "", phone: "", email: "", postalCode: "", address: "", websiteUrl: "" });
  const [policy, setPolicy] = useState("");
  const [message, setMessage] = useState("");

  async function loadOnboarding(cid: string) {
    const token = await getAccessToken();
    const res = await fetch(`/api/clinic/onboarding?clinic_id=${cid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const { progress: prog, profile: prof } = await res.json();
      setProgress(prog);
      setProfile(prof);
      if (prof) {
        setPf({ clinicDisplayName: prof.clinicDisplayName, directorName: prof.directorName, phone: prof.phone, email: prof.email, postalCode: prof.postalCode, address: prof.address, websiteUrl: prof.websiteUrl });
        setPolicy(prof.cancellationPolicy);
        setMessage(prof.defaultMessage);
      }
    }
  }

  useEffect(() => {
    (async () => {
      const clinic = await getCurrentClinic();
      if (!clinic) { router.replace("/login"); return; }
      setClinicId(clinic.id);
      await loadOnboarding(clinic.id);
      setLoading(false);
    })();
  }, [router]);

  async function saveProfile() {
    if (!clinicId) return;
    setSaving(true);
    const token = await getAccessToken();
    await fetch("/api/clinic/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clinicId, ...pf }),
    });
    await loadOnboarding(clinicId);
    setProfileOpen(false);
    setSaving(false);
  }

  async function savePolicy() {
    if (!clinicId) return;
    setSaving(true);
    const token = await getAccessToken();
    await fetch("/api/clinic/policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clinicId, cancellationPolicy: policy }),
    });
    await loadOnboarding(clinicId);
    setPolicyOpen(false);
    setSaving(false);
  }

  async function saveNotification() {
    if (!clinicId) return;
    setSaving(true);
    const token = await getAccessToken();
    await fetch("/api/clinic/notification", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clinicId, defaultMessage: message }),
    });
    await loadOnboarding(clinicId);
    setNotificationOpen(false);
    setSaving(false);
  }

  async function activate() {
    if (!clinicId) return;
    setSaving(true);
    const token = await getAccessToken();
    const res = await fetch("/api/clinic/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clinicId }),
    });
    setSaving(false);
    if (res.ok) router.replace("/clinic");
  }

  const allDone = !!progress?.profileCompleted && !!progress?.policyCompleted && !!progress?.notificationCompleted;

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">読み込み中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <button onClick={() => router.push("/clinic")} className="text-gray-400 text-sm hover:text-gray-900 transition">← 管理画面へ</button>
        <h1 className="text-xl font-black mt-1">初期設定</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">医院プロフィール</p>
              <p className="text-xs text-gray-400 mt-0.5">医院名・院長名・連絡先・住所</p>
            </div>
            <div className="flex items-center gap-3">
              {progress?.profileCompleted
                ? <span className="text-teal-600 font-bold text-sm">✓ 設定済み</span>
                : <span className="text-xs text-gray-400">未設定</span>}
              <button onClick={() => setProfileOpen(o => !o)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
                {profileOpen ? "閉じる" : "設定する"}
              </button>
            </div>
          </div>
          {profileOpen && (
            <div className="mt-4 space-y-3">
              <div><label className={labelCls}>医院表示名</label><input className={inputCls} value={pf.clinicDisplayName} onChange={e => setPf(p => ({ ...p, clinicDisplayName: e.target.value }))} /></div>
              <div><label className={labelCls}>院長名</label><input className={inputCls} value={pf.directorName} onChange={e => setPf(p => ({ ...p, directorName: e.target.value }))} /></div>
              <div><label className={labelCls}>電話番号</label><input className={inputCls} value={pf.phone} onChange={e => setPf(p => ({ ...p, phone: e.target.value }))} /></div>
              <div><label className={labelCls}>メールアドレス</label><input className={inputCls} value={pf.email} onChange={e => setPf(p => ({ ...p, email: e.target.value }))} /></div>
              <div><label className={labelCls}>郵便番号</label><input className={inputCls} value={pf.postalCode} onChange={e => setPf(p => ({ ...p, postalCode: e.target.value }))} /></div>
              <div><label className={labelCls}>住所</label><input className={inputCls} value={pf.address} onChange={e => setPf(p => ({ ...p, address: e.target.value }))} /></div>
              <div><label className={labelCls}>Webサイト</label><input className={inputCls} value={pf.websiteUrl} onChange={e => setPf(p => ({ ...p, websiteUrl: e.target.value }))} /></div>
              <button onClick={saveProfile} disabled={saving} className="px-4 py-2 bg-teal-600 rounded-xl text-white text-sm font-bold hover:bg-teal-700 transition disabled:opacity-50">
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">キャンセルポリシー</p>
              <p className="text-xs text-gray-400 mt-0.5">患者に表示するキャンセル規約</p>
            </div>
            <div className="flex items-center gap-3">
              {progress?.policyCompleted
                ? <span className="text-teal-600 font-bold text-sm">✓ 設定済み</span>
                : <span className="text-xs text-gray-400">未設定</span>}
              <button onClick={() => setPolicyOpen(o => !o)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
                {policyOpen ? "閉じる" : "設定する"}
              </button>
            </div>
          </div>
          {policyOpen && (
            <div className="mt-4 space-y-3">
              <textarea className={`${inputCls} min-h-[120px] resize-y`} value={policy} onChange={e => setPolicy(e.target.value)} placeholder="例：予約日24時間前以降のキャンセルは、キャンセル料が発生します。" />
              <button onClick={savePolicy} disabled={saving} className="px-4 py-2 bg-teal-600 rounded-xl text-white text-sm font-bold hover:bg-teal-700 transition disabled:opacity-50">
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">予約確認メッセージ</p>
              <p className="text-xs text-gray-400 mt-0.5">予約確定時に患者へ送るメッセージ</p>
            </div>
            <div className="flex items-center gap-3">
              {progress?.notificationCompleted
                ? <span className="text-teal-600 font-bold text-sm">✓ 設定済み</span>
                : <span className="text-xs text-gray-400">未設定</span>}
              <button onClick={() => setNotificationOpen(o => !o)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
                {notificationOpen ? "閉じる" : "設定する"}
              </button>
            </div>
          </div>
          {notificationOpen && (
            <div className="mt-4 space-y-3">
              <textarea className={`${inputCls} min-h-[120px] resize-y`} value={message} onChange={e => setMessage(e.target.value)} placeholder="例：ご予約が確定しました。当日はお時間に余裕をもってお越しください。" />
              <button onClick={saveNotification} disabled={saving} className="px-4 py-2 bg-teal-600 rounded-xl text-white text-sm font-bold hover:bg-teal-700 transition disabled:opacity-50">
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          )}
        </div>

        <div className={`rounded-2xl border shadow-sm p-5 flex items-center justify-between ${allDone ? "border-teal-200 bg-teal-50" : "border-gray-200 bg-white"}`}>
          <div>
            <p className="font-bold text-gray-900">利用開始</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {allDone ? "すべての設定が完了しました" : "上記3項目をすべて設定してください"}
            </p>
          </div>
          <button
            onClick={activate}
            disabled={!allDone || saving}
            className="px-5 py-2.5 bg-teal-600 rounded-xl text-white font-bold text-sm hover:bg-teal-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {saving ? "処理中..." : "利用開始"}
          </button>
        </div>

      </div>
    </div>
  );
}
