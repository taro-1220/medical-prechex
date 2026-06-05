"use client";
import { useState } from "react";
import Link from "next/link";

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
  const [activeTab, setActiveTab] = useState<"sms" | "line" | "email">("sms");
  const [copiedTpl, setCopiedTpl] = useState(false);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, communicationChannel: "manual" }),
    });
    const appt = await res.json();
    setConfirmUrl(`${location.origin}/confirm/${appt.token}`);
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
      line: `【${form.clinicName}】${form.patientName} 様\n\nご予約の確認をお願いします。\n予約内容：${form.description}（${apptDate}）\n\n${confirmUrl}`,
      email: `件名：【予約確認】${form.description} ご確認のお願い\n\n${form.patientName} 様\n\nご予約の確認をお願いします。\n以下のURLからご確認ください。\n\n${confirmUrl}\n\n${form.clinicName}`,
    };

    const TAB_LABELS: Record<"sms" | "line" | "email", string> = { sms: "SMS", line: "LINE", email: "メール" };

    return (
      <div className="min-h-screen bg-[#0B1629] text-white flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-lg space-y-4">
          <div className="text-center mb-2">
            <div className="text-5xl mb-4">✓</div>
            <h1 className="text-2xl font-black">予約作成完了</h1>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">確認URL</p>
            <p className="text-sm text-blue-300 break-all font-mono bg-white/5 rounded-lg px-3 py-2 mb-4 leading-relaxed select-all">{confirmUrl}</p>
            <button
              onClick={copyUrl}
              className="w-full py-3 rounded-xl bg-blue-600 font-bold hover:bg-blue-500 transition text-sm"
            >
              {copied ? "コピーしました ✓" : "コピー"}
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40">送信用テンプレート</p>
              <span className="text-xs text-white/30 border border-white/10 rounded-full px-2.5 py-0.5">自動送信ではありません</span>
            </div>
            <p className="text-xs text-white/30 mb-4">本文をコピーして手動で送信してください</p>

            <div className="flex gap-1 mb-4">
              {(["sms", "line", "email"] as const).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setActiveTab(ch)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === ch ? "bg-blue-600 text-white" : "bg-white/5 text-white/40 hover:bg-white/10"}`}
                >
                  {TAB_LABELS[ch]}
                </button>
              ))}
            </div>

            <pre className="text-xs text-white/70 bg-white/5 rounded-lg px-3 py-3 whitespace-pre-wrap break-all leading-relaxed mb-4 select-all font-sans">
              {templates[activeTab]}
            </pre>

            <button
              onClick={() => copyTemplate(templates[activeTab])}
              className="w-full py-2.5 rounded-xl border border-white/20 text-sm font-bold hover:bg-white/10 transition"
            >
              {copiedTpl ? "コピーしました ✓" : `${TAB_LABELS[activeTab]} 用本文をコピー`}
            </button>
          </div>

          <button
            onClick={() => { setConfirmUrl(null); setForm({ clinicName: "", patientName: "", phone: "", email: "", appointmentAt: "", description: "", cancellationPolicy: DEFAULT_POLICY }); }}
            className="w-full py-3 rounded-2xl border border-white/20 font-bold hover:bg-white/5 transition text-sm"
          >
            新しい予約を作成
          </button>

          <Link href="/clinic" className="block text-center text-sm text-white/40 hover:text-white transition">
            ← 予約一覧に戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1629] text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <Link href="/clinic" className="text-white/40 text-sm hover:text-white transition">← 予約一覧</Link>
        <h1 className="text-xl font-black">新規予約作成</h1>
      </header>

      <div className="max-w-lg mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          {([
            { key: "clinicName", label: "クリニック名", type: "text", required: true, placeholder: "○○クリニック" },
            { key: "patientName", label: "患者名", type: "text", required: true, placeholder: "山田 太郎" },
            { key: "phone", label: "電話番号", type: "tel", required: false, placeholder: "090-0000-0000" },
            { key: "email", label: "メールアドレス", type: "email", required: false, placeholder: "patient@example.com" },
            { key: "appointmentAt", label: "予約日時", type: "datetime-local", required: true, placeholder: "" },
            { key: "description", label: "予約内容", type: "text", required: true, placeholder: "初診・一般診療" },
          ] as const).map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-bold mb-1.5 text-white/80">
                {f.label}
                {f.required && <span className="text-red-400 ml-1">*</span>}
              </label>
              <input
                type={f.type}
                placeholder={f.placeholder}
                required={f.required}
                value={form[f.key]}
                onChange={set(f.key)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500 transition text-sm"
              />
            </div>
          ))}

          <div>
            <label className="block text-sm font-bold mb-1.5 text-white/80">
              予約確認ポリシー<span className="text-red-400 ml-1">*</span>
            </label>
            <textarea
              required
              rows={5}
              value={form.cancellationPolicy}
              onChange={set("cancellationPolicy")}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500 transition text-sm resize-none leading-relaxed"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-blue-600 font-bold hover:bg-blue-500 transition disabled:opacity-50 text-base"
          >
            {loading ? "作成中..." : "確認URLを発行"}
          </button>
        </form>
      </div>
    </div>
  );
}
