"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { Patient } from "@/lib/types";
import { getCurrentClinic } from "@/lib/clinic-auth";

const DEFAULT_POLICY =
  "予約日の前日までのキャンセルは無料です。当日キャンセルおよび無断キャンセルには、予約確認対象額の全額をご請求する場合があります。";

type FormState = {
  patientName: string;
  phone: string;
  email: string;
  appointmentAt: string;
  description: string;
  cancellationPolicy: string;
};

const EMPTY_FORM: FormState = {
  patientName: "",
  phone: "",
  email: "",
  appointmentAt: "",
  description: "",
  cancellationPolicy: DEFAULT_POLICY,
};

export default function ClinicNewPage() {
  // クリニック名（既存予約から取得、初回のみ入力）
  const [clinicName, setClinicName] = useState("");
  const [clinicResolved, setClinicResolved] = useState(false);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmUrl, setConfirmUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"sms" | "line" | "email">("line");
  const [copiedTpl, setCopiedTpl] = useState(false);

  // 患者検索
  const [searchQuery, setSearchQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // ログイン中クリニックから取得
  useEffect(() => {
    getCurrentClinic()
      .then(c => {
        if (c) {
          setClinicName(c.name);
          setClinicResolved(true);
        }
      })
      .catch(() => {});
  }, []);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  // リアルタイム患者検索（200ms debounce）
  useEffect(() => {
    if (searchQuery.length < 2) {
      setPatients([]);
      setShowDropdown(false);
      setSearchDone(false);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/patients/search?q=${encodeURIComponent(searchQuery)}`)
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            setPatients(data);
            setShowDropdown(data.length > 0);
            setSearchDone(true);
          }
        })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
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
    setSelectedPatient(p);
    setSearchQuery(p.name);
    setShowDropdown(false);
    setSearchDone(false);
  };

  const clearPatient = () => {
    setSelectedPatient(null);
    setSearchQuery("");
    setForm(prev => ({ ...prev, patientName: "", phone: "", email: "" }));
    setPatients([]);
    setSearchDone(false);
  };

  const registerAsNew = () => {
    setForm(prev => ({ ...prev, patientName: searchQuery }));
    setSearchDone(false);
    setShowDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        clinicName,
        communicationChannel: "manual",
        ...(selectedPatient ? { patientId: selectedPatient.id } : {}),
      }),
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

  const noResults = searchQuery.length >= 2 && searchDone && patients.length === 0 && !selectedPatient;

  // ─── 確認URL発行後の画面 ───────────────────────────────
  if (confirmUrl) {
    const apptDate = form.appointmentAt
      ? new Date(form.appointmentAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "";

    const templates = {
      sms: `【${clinicName}】${form.patientName} 様\n予約確認をお願いします。\n${confirmUrl}`,
      line: `【${clinicName}】\n\n${form.patientName}様\n\nご予約ありがとうございます。\n\nご来院前に予約内容の確認と同意のお手続きをお願いいたします。\n\n▼確認はこちら\n${confirmUrl}\n\n確認完了後、受付用QRチケットが表示されます。\nご来院時に受付スタッフへご提示ください。\n\n――――――\nmedipre（メディプリ）`,
      email: `件名：【予約確認】${form.description} ご確認のお願い\n\n${form.patientName} 様\n\nご予約の確認をお願いします。\n以下のURLからご確認ください。\n\n${confirmUrl}\n\n${clinicName}`,
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
            <p className="text-sm text-gray-500 mt-1">{form.patientName} 様 · {apptDate}</p>
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
            onClick={() => {
              setConfirmUrl(null);
              setForm(EMPTY_FORM);
              setSearchQuery("");
              setSelectedPatient(null);
              setPatients([]);
              setSearchDone(false);
            }}
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

  // ─── 予約作成フォーム ───────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center gap-4">
        <Link href="/clinic" className="text-gray-400 text-sm hover:text-gray-900 transition">← 予約一覧</Link>
        <div>
          {clinicResolved && <p className="text-xs text-gray-400">{clinicName}</p>}
          <h1 className="text-xl font-black text-gray-900">予約作成</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-6 py-6">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ① 患者検索カード */}
          <div ref={searchRef} className="bg-gray-100 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔍</span>
              <div>
                <p className="font-bold text-gray-900 text-sm">患者検索</p>
                <p className="text-xs text-gray-500">名前・電話番号・メールで検索</p>
              </div>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="山田太郎 / 090-..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSelectedPatient(null); }}
                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-teal-500 transition text-sm"
              />
              {showDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {patients.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPatient(p)}
                      className="w-full text-left px-4 py-3 hover:bg-teal-50 border-b border-gray-100 last:border-b-0 transition"
                    >
                      <p className="font-bold text-sm text-gray-900">{p.name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {p.phone && <span className="text-xs text-gray-500">{p.phone}</span>}
                        {p.email && <span className="text-xs text-gray-400">{p.email}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 選択済み */}
            {selectedPatient && (
              <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs text-teal-600 font-bold mb-0.5">✓ 既存患者を選択</p>
                  <p className="text-sm font-bold text-gray-900">{selectedPatient.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {[selectedPatient.phone, selectedPatient.email].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearPatient}
                  className="text-gray-400 hover:text-gray-600 transition text-lg px-2 py-1"
                  aria-label="選択解除"
                >
                  ✕
                </button>
              </div>
            )}

            {/* 0件時の新規登録導線 */}
            {noResults && (
              <button
                type="button"
                onClick={registerAsNew}
                className="w-full py-3 rounded-xl border-2 border-dashed border-teal-300 text-teal-600 text-sm font-bold hover:bg-teal-50 transition"
              >
                ＋ 新規患者として登録
              </button>
            )}
          </div>

          {/* ② 患者情報（自動入力・編集可） */}
          <div className="space-y-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">患者情報</p>
            {([
              { key: "patientName", label: "患者名", type: "text", required: true, placeholder: "山田 太郎" },
              { key: "phone",       label: "電話番号", type: "tel",  required: false, placeholder: "090-0000-0000" },
              { key: "email",       label: "メール",   type: "email",required: false, placeholder: "patient@example.com" },
            ] as const).map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-bold mb-1.5 text-gray-700">
                  {f.label}{f.required && <span className="text-red-500 ml-1">*</span>}
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
          </div>

          {/* ③ 予約日時 */}
          <div>
            <label className="block text-sm font-bold mb-1.5 text-gray-700">
              予約日時<span className="text-red-500 ml-1">*</span>
            </label>
            <input
              type="datetime-local"
              required
              value={form.appointmentAt}
              onChange={set("appointmentAt")}
              className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 focus:outline-none focus:border-teal-500 transition text-sm"
            />
          </div>

          {/* ④ 予約内容 */}
          <div>
            <label className="block text-sm font-bold mb-1.5 text-gray-700">
              予約内容<span className="text-red-500 ml-1">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="初診・一般診療"
              value={form.description}
              onChange={set("description")}
              className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-teal-500 transition text-sm"
            />
          </div>

          {/* 初回のみクリニック名入力 */}
          {!clinicResolved && (
            <div>
              <label className="block text-sm font-bold mb-1.5 text-gray-700">
                クリニック名<span className="text-red-500 ml-1">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="○○クリニック"
                value={clinicName}
                onChange={e => setClinicName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-teal-500 transition text-sm"
              />
            </div>
          )}

          {/* ⑤ キャンセルポリシー */}
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

          {/* ⑥ 確認URL発行 */}
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
