"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { Patient } from "@/lib/types";

const DEFAULT_POLICY =
  "予約日の前日までのキャンセルは無料です。当日キャンセルおよび無断キャンセルには、予約確認対象額の全額をご請求する場合があります。";

type FormState = {
  clinicName: string;
  patientName: string;
  phone: string;
  email: string;
  appointmentAt: string;
  description: string;
  cancellationPolicy: string;
};

export default function ClinicNewPage() {
  const [form, setForm] = useState<FormState>({
    clinicName: "",
    patientName: "",
    phone: "",
    email: "",
    appointmentAt: "",
    description: "",
    cancellationPolicy: DEFAULT_POLICY,
  });
  const [confirmUrl, setConfirmUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"sms" | "line" | "email">("line");
  const [copiedTpl, setCopiedTpl] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  useEffect(() => {
    if (searchQuery.length < 2) { setPatients([]); setShowDropdown(false); return; }
    fetch(`/api/patients/search?q=${encodeURIComponent(searchQuery)}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) { setPatients(data); setShowDropdown(data.length > 0); } })
      .catch(() => {});
  }, [searchQuery]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectPatient = (p: Patient) => {
    setForm(prev => ({ ...prev, patientName: p.name, phone: p.phone, email: p.email }));
    setSelectedPatientId(p.id);
    setSearchQuery(p.name);
    setShowDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, communicationChannel: "manual", ...(selectedPatientId ? { patientId: selectedPatientId } : {}) }),
    });
    const appt = await res.json();
    setConfirmUrl(`https://www.medipre.jp/confirm/${appt.token}`);
    setLoading(false);
  };

  const copyUrl = () => {
    if (!confirmUrl) return;
    navigator.clipboard.writeText(confirmUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyTemplate = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTpl(true);
    setTimeout(() => setCopiedTpl(false), 2000);
  };

  if (confirmUrl) {
    const apptDate = form.appointmentAt
      ? new Date(form.appointmentAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "";

    const templates = {
      sms: `【${form.clinicName}】${form.patientName} 様\n予約確認をお願いします。\n${confirmUrl}`,
      line: `【${form.clinicName}】${form.patientName} 様\n\nご予約いただきありがとうございます。\n以下のURLからご予約内容をご確認・ご同意ください。\n\n■ 予約日時：${apptDate}\n■ 予約内容：${form.description}\n\n${confirmUrl}\n\nURLを開いてご同意いただくと、来院用QRチケットが発行されます。受付スタッフにQRをご提示ください。\n\n─\nmedipre（メディプリ）／${form.clinicName}`,
      email: `件名：【予約確認】${form.description} ご確認のお願い\n\n${form.patientName} 様\n\nご予約の確認をお願いします。\n以下のURLからご確認ください。\n\n${confirmUrl}\n\n${form.clinicName}`,
    };

    const TAB_LABELS: Record<"sms" | "line" | "email", string> = { sms: "SMS", line: "LINE", email: "メール" };

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-lg space-y-4">
          <div className="text-center mb-2">
            <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl text-teal-600">✓</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900">予約作成完了</h1>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">確認URL</p>
            <p className="text-sm text-teal-700 break-all font-mono bg-gray-50 rounded-lg px-3 py-2 mb-4 leading-relaxed select-all border border-gray-200">{confirmUrl}</p>
            <button
              onClick={copyUrl}
              className="w-full py-3 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-700 transition text-sm"
            >
              {copied ? "コピーしました ✓" : "コピー"}
            </button>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">送信用テンプレート</p>
              <span className="text-xs text-gray-400 border border-gray-200 rounded-full px-2.5 py-0.5">自動送信ではありません</span>
            </div>
            <p className="text-xs text-gray-400 mb-4">本文をコピーして手動で送信してください</p>

            <div className="flex gap-1 mb-4">
              {(["sms", "line", "email"] as const).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setActiveTab(ch)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === ch ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                >
                  {TAB_LABELS[ch]}
                </button>
              ))}
            </div>

            <pre className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 whitespace-pre-wrap break-all leading-relaxed mb-4 select-all font-sans">
              {templates[activeTab]}
            </pre>

            <div className="flex gap-2">
              <button
                onClick={() => copyTemplate(templates[activeTab])}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition"
              >
                {copiedTpl ? "コピーしました ✓" : `${TAB_LABELS[activeTab]}文面をコピー`}
              </button>
              {activeTab === "line" && (
                <button
                  onClick={() => window.open(`https://line.me/R/msg/text/?${encodeURIComponent(templates.line)}`, "_blank")}
                  className="flex-1 py-2.5 rounded-xl bg-[#06C755] text-white text-sm font-bold hover:opacity-90 transition"
                >
                  LINEで送る
                </button>
              )}
            </div>
          </div>

          <button
            onClick={() => { setConfirmUrl(null); setForm({ clinicName: "", patientName: "", phone: "", email: "", appointmentAt: "", description: "", cancellationPolicy: DEFAULT_POLICY }); setSearchQuery(""); setSelectedPatientId(null); setPatients([]); }}
            className="w-full py-3 rounded-2xl border border-gray-200 font-bold text-gray-700 hover:bg-gray-100 transition text-sm"
          >
            新しい予約を作成
          </button>

          <Link href="/clinic" className="block text-center text-sm text-gray-400 hover:text-gray-700 transition">
            ← 予約一覧に戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center gap-4">
        <Link href="/clinic" className="text-gray-400 text-sm hover:text-gray-900 transition">← 予約一覧</Link>
        <h1 className="text-xl font-black text-gray-900">新規予約作成</h1>
      </header>

      <div className="max-w-lg mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 患者検索 */}
          <div ref={searchRef} className="relative">
            <label className="block text-sm font-bold mb-1.5 text-gray-700">
              既存患者を検索（名前・電話番号・メール）
            </label>
            <input
              type="text"
              placeholder="山田太郎 / 090-..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSelectedPatientId(null); }}
              className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-teal-500 transition text-sm"
            />
            {selectedPatientId && (
              <p className="text-xs text-teal-600 mt-1">✓ 既存患者を選択済み</p>
            )}
            {showDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                {patients.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectPatient(p)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition"
                  >
                    <p className="font-bold text-sm text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{[p.phone, p.email].filter(Boolean).join(" · ")}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {([
            { key: "clinicName", label: "クリニック名", type: "text", required: true, placeholder: "○○クリニック" },
            { key: "patientName", label: "患者名", type: "text", required: true, placeholder: "山田 太郎" },
            { key: "phone", label: "電話番号", type: "tel", required: false, placeholder: "090-0000-0000" },
            { key: "email", label: "メールアドレス", type: "email", required: false, placeholder: "patient@example.com" },
            { key: "appointmentAt", label: "予約日時", type: "datetime-local", required: true, placeholder: "" },
            { key: "description", label: "予約内容", type: "text", required: true, placeholder: "初診・一般診療" },
          ] as const).map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-bold mb-1.5 text-gray-700">
                {f.label}
                {f.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              <input
                type={f.type}
                placeholder={f.placeholder}
                required={f.required}
                value={form[f.key]}
                onChange={set(f.key)}
                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-teal-500 transition text-sm"
              />
            </div>
          ))}

          <div>
            <label className="block text-sm font-bold mb-1.5 text-gray-700">
              予約確認ポリシー<span className="text-red-500 ml-1">*</span>
            </label>
            <textarea
              required
              rows={5}
              value={form.cancellationPolicy}
              onChange={set("cancellationPolicy")}
              className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 focus:outline-none focus:border-teal-500 transition text-sm resize-none leading-relaxed"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-teal-600 text-white font-bold hover:bg-teal-700 transition disabled:opacity-50 text-base"
          >
            {loading ? "作成中..." : "確認URLを発行"}
          </button>
        </form>
      </div>
    </div>
  );
}
