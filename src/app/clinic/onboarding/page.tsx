"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken, getCurrentClinic } from "@/lib/clinic-auth";
import type { ClinicProfile, OnboardingProgress } from "@/lib/types";

export default function OnboardingPage() {
  const router = useRouter();
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [profile, setProfile] = useState<ClinicProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const clinic = await getCurrentClinic();
      if (!clinic) { router.replace("/login"); return; }
      setClinicId(clinic.id);
      const token = await getAccessToken();
      const res = await fetch(`/api/clinic/onboarding?clinic_id=${clinic.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { progress: prog, profile: prof } = await res.json();
        setProgress(prog);
        setProfile(prof);
      }
      setLoading(false);
    })();
  }, [router]);

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

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 flex items-center justify-between">
          <div>
            <p className="font-bold text-gray-900">医院プロフィール</p>
            <p className="text-xs text-gray-400 mt-0.5">医院名・院長名・連絡先・住所</p>
          </div>
          {progress?.profileCompleted
            ? <span className="text-teal-600 font-bold text-sm">✓ 設定済み</span>
            : <span className="text-xs text-gray-400">未設定</span>}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 flex items-center justify-between">
          <div>
            <p className="font-bold text-gray-900">キャンセルポリシー</p>
            <p className="text-xs text-gray-400 mt-0.5">患者に表示するキャンセル規約</p>
          </div>
          {progress?.policyCompleted
            ? <span className="text-teal-600 font-bold text-sm">✓ 設定済み</span>
            : <span className="text-xs text-gray-400">未設定</span>}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 flex items-center justify-between">
          <div>
            <p className="font-bold text-gray-900">予約確認メッセージ</p>
            <p className="text-xs text-gray-400 mt-0.5">予約確定時に患者へ送るメッセージ</p>
          </div>
          {progress?.notificationCompleted
            ? <span className="text-teal-600 font-bold text-sm">✓ 設定済み</span>
            : <span className="text-xs text-gray-400">未設定</span>}
        </div>

        <div className={`rounded-2xl border shadow-sm p-5 flex items-center justify-between ${allDone ? "border-teal-200 bg-teal-50" : "border-gray-200 bg-white"}`}>
          <div>
            <p className="font-bold text-gray-900">利用開始</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {allDone ? "すべての設定が完了しました" : "上記3項目をすべて設定してください"}
            </p>
          </div>
          <button
            disabled={!allDone}
            className="px-5 py-2.5 bg-teal-600 rounded-xl text-white font-bold text-sm hover:bg-teal-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            利用開始
          </button>
        </div>

      </div>
    </div>
  );
}
