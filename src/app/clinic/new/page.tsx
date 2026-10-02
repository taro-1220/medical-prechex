"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { MessageChannel, Patient, TemplateWithMeta, TreatmentCategory, ClinicCancelPolicySettings } from "@/lib/types";
import { getAccessToken, getCurrentClinic } from "@/lib/clinic-auth";
import { DEFAULT_TEMPLATES, renderTemplate, findUnresolvedPlaceholders } from "@/lib/message-templates";
import { resolveCancelPolicyApplication } from "@/lib/cancel-policy";
import { checkPolicyTierConsistency } from "@/lib/charge-policy";

const TREATMENT_CATEGORY_LABEL: Record<TreatmentCategory, string> = { private: "自由診療", insurance: "保険診療", other: "その他" };

const CHANNELS: MessageChannel[] = ["sms", "line", "email"];
const TAB_LABELS: Record<MessageChannel, string> = { sms: "SMS", line: "LINE", email: "メール" };

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
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [clinicResolved, setClinicResolved] = useState(false);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmUrl, setConfirmUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<MessageChannel>("line");
  const [copiedTpl, setCopiedTpl] = useState(false);

  // 送信申告（「送信しました」押下の記録）。送信成否の自動取得はしない
  const [apptToken, setApptToken] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<Record<MessageChannel, string | null>>({ sms: null, line: null, email: null });
  const [confirmChannel, setConfirmChannel] = useState<MessageChannel | null>(null);
  const [marking, setMarking] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);

  // 医院のテンプレート（保存済み or フォールバック）。今回限りの編集は bodies に閉じ、
  // templateMetas（医院共通テンプレート）自体は書き換えない。
  const [templateMetas, setTemplateMetas] = useState<Record<MessageChannel, TemplateWithMeta> | null>(null);
  const [templatesLoadError, setTemplatesLoadError] = useState(false);
  const [bodies, setBodies] = useState<Record<MessageChannel, string> | null>(null);

  // 患者検索
  const [searchQuery, setSearchQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // MVP+1: キャンセル料ポリシー
  const [treatmentCategory, setTreatmentCategory] = useState<TreatmentCategory>("other");
  const [cancelPolicySettings, setCancelPolicySettings] = useState<ClinicCancelPolicySettings | null>(null);
  const [cancelPolicyManualOverride, setCancelPolicyManualOverride] = useState<boolean | null>(null);
  const [cancelPolicyPreviewOpen, setCancelPolicyPreviewOpen] = useState(false);

  // MVP+2: カード登録・課金
  const [cardRegistrationRequired, setCardRegistrationRequired] = useState(false);
  const [baseAmount, setBaseAmount] = useState("");

  // ログイン中クリニックから取得
  useEffect(() => {
    getCurrentClinic()
      .then(c => {
        if (c) {
          setClinicName(c.name);
          setClinicId(c.id);
          setClinicResolved(true);
        }
      })
      .catch(() => {});
  }, []);

  // 保存済みの予約確認ポリシーを初期値として反映（空の場合のみDEFAULT_POLICYのまま）
  useEffect(() => {
    if (!clinicId) return;
    (async () => {
      const token = await getAccessToken();
      const res = await fetch(`/api/clinic/onboarding?clinic_id=${clinicId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) return;
      const { profile } = await res.json();
      if (profile?.cancellationPolicy) {
        setForm(prev => ({ ...prev, cancellationPolicy: profile.cancellationPolicy }));
      }
    })().catch(() => {});
  }, [clinicId]);

  // キャンセル料ポリシー設定（未設定/無効な医院ではUIに一切表示しない）
  useEffect(() => {
    if (!clinicId) return;
    (async () => {
      const token = await getAccessToken();
      const res = await fetch(`/api/clinic/cancel-policy?clinic_id=${clinicId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) return;
      setCancelPolicySettings(await res.json());
    })().catch(() => {});
  }, [clinicId]);

  // 診療区分が変わったら手動上書きをリセット（既定ルールに戻す）
  useEffect(() => {
    setCancelPolicyManualOverride(null);
    setCancelPolicyPreviewOpen(false);
  }, [treatmentCategory]);

  const cancelPolicyApplied = cancelPolicySettings
    ? resolveCancelPolicyApplication(
        { enabled: cancelPolicySettings.enabled, scope: cancelPolicySettings.scope },
        treatmentCategory,
        cancelPolicyManualOverride,
      )
    : false;
  const activeCancelPolicy =
    treatmentCategory === "private" || treatmentCategory === "insurance"
      ? cancelPolicySettings?.policies[treatmentCategory] ?? null
      : null;

  // 送信用テンプレート（SMS/LINE/メール）を医院設定から取得
  useEffect(() => {
    if (!clinicId) return;
    (async () => {
      const token = await getAccessToken();
      const res = await fetch(`/api/clinic/templates?clinic_id=${clinicId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) { setTemplatesLoadError(true); return; }
      const { templates }: { templates: TemplateWithMeta[] } = await res.json();
      setTemplateMetas(Object.fromEntries(templates.map(t => [t.channel, t])) as Record<MessageChannel, TemplateWithMeta>);
    })().catch(() => setTemplatesLoadError(true));
  }, [clinicId]);

  const getMeta = (channel: MessageChannel): TemplateWithMeta =>
    templateMetas?.[channel] ?? {
      channel,
      subject: DEFAULT_TEMPLATES[channel].subject,
      body: DEFAULT_TEMPLATES[channel].body,
      source: "default",
      updatedAt: null,
    };

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
    const timer = setTimeout(async () => {
      const token = await getAccessToken();
      fetch(`/api/patients/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
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

    // Phase J セクションB: 「予約確認ポリシー」本文とtiersの無料境界の矛盾を保存時に警告する
    // （ブロックはしない。誤検知は許容し、検出できないケースはそのまま素通りさせる）
    if (cancelPolicyApplied && activeCancelPolicy?.tiers) {
      const consistency = checkPolicyTierConsistency(form.cancellationPolicy, activeCancelPolicy.tiers);
      if (consistency.mismatched) {
        showToast(
          "warning",
          `⚠ 本文は「${consistency.statedDaysBefore}日前」までの記載ですが、段階テーブルの無料境界は「${consistency.tierDaysBefore}日前」です。内容をご確認ください`,
        );
      }
    }

    setLoading(true);
    const token = await getAccessToken();
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        ...form,
        clinicName,
        ...(clinicId ? { clinicId } : {}),
        communicationChannel: "manual",
        ...(selectedPatient ? { patientId: selectedPatient.id } : {}),
        treatmentCategory,
        cancelPolicyManualOverride,
        cardRegistrationRequired,
        ...(cardRegistrationRequired ? { baseAmount: Number(baseAmount) || 0 } : {}),
      }),
    });
    const appt = await res.json();
    const url = `https://www.medipre.jp/confirm/${appt.token}`;
    setConfirmUrl(url);
    setApptToken(appt.token);
    setSentAt({ sms: null, line: null, email: null });

    const vars = { patientName: form.patientName, clinicName, confirmUrl: url, description: form.description };
    setBodies(Object.fromEntries(CHANNELS.map(ch => [ch, renderTemplate(getMeta(ch).body, vars)])) as Record<MessageChannel, string>);

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

  const showToast = (type: "success" | "error" | "warning", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const markSent = async (channel: MessageChannel) => {
    if (!apptToken || marking) return;
    setMarking(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/appointments/${apptToken}/mark-sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ channel }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { sentAt: at } = await res.json();
      setSentAt(prev => ({ ...prev, [channel]: at }));
      setConfirmChannel(null);
      showToast("success", `✅ ${TAB_LABELS[channel]}送信済みとして記録しました`);
    } catch {
      // 失敗時は送信済みUIへ変更しない。モーダルを開いたままにして再試行できるようにする
      showToast("error", "記録に失敗しました。通信環境を確認して再試行してください");
    } finally {
      setMarking(false);
    }
  };

  const noResults = searchQuery.length >= 2 && searchDone && patients.length === 0 && !selectedPatient;

  // ─── 確認URL発行後の画面 ───────────────────────────────
  if (confirmUrl && bodies) {
    const apptDate = form.appointmentAt
      ? new Date(form.appointmentAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "";

    const activeMeta = getMeta(activeTab);
    const renderedSubject = activeTab === "email" && activeMeta.subject
      ? renderTemplate(activeMeta.subject, { patientName: form.patientName, clinicName, confirmUrl, description: form.description })
      : null;
    const activeBody = bodies[activeTab];
    const unresolved = findUnresolvedPlaceholders(`${renderedSubject ?? ""}\n${activeBody}`);
    const copyText = activeTab === "email" && renderedSubject ? `件名：${renderedSubject}\n\n${activeBody}` : activeBody;

    const activeSentAt = sentAt[activeTab];

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 py-10">
        {toast && (
          <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-bold ${toast.type === "success" ? "bg-emerald-600 text-white" : toast.type === "warning" ? "bg-amber-500 text-white" : "bg-red-600 text-white"}`}>
            {toast.message}
          </div>
        )}
        {confirmChannel && (
          <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center pt-20 px-6">
            <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 text-center">
              <p className="font-bold text-gray-900 mb-4">{TAB_LABELS[confirmChannel]}で送信できましたか？</p>
              <div className="space-y-2">
                <button
                  onClick={() => markSent(confirmChannel)}
                  disabled={marking}
                  className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {marking ? "記録中..." : "送信しました"}
                </button>
                <button
                  onClick={() => setConfirmChannel(null)}
                  disabled={marking}
                  className="w-full py-3 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition disabled:opacity-50"
                >
                  まだです
                </button>
              </div>
            </div>
          </div>
        )}
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

          <div className={`rounded-2xl border shadow-sm p-6 ${activeSentAt ? "border-emerald-200 bg-[#F0FFF6]" : "border-gray-200 bg-white"}`}>
            {activeSentAt && (
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                  ✓ {TAB_LABELS[activeTab]}送信済み
                </span>
                <span className="text-xs text-emerald-700">
                  {new Date(activeSentAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} に記録
                </span>
              </div>
            )}
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">送信用テンプレート</p>
              <span className="text-xs text-gray-400 border border-gray-200 rounded-full px-2.5 py-0.5">自動送信ではありません</span>
            </div>
            <p className="text-xs text-gray-400 mb-1">本文をコピーして手動で送信してください（今回だけの編集も可能です）</p>
            {templatesLoadError && (
              <p className="text-xs text-amber-600 mb-1">テンプレートの読み込みに失敗したため、初期文を表示しています</p>
            )}
            <Link href="/clinic/templates" className="text-xs text-teal-600 hover:underline">医院共通のテンプレートを編集する →</Link>

            <div className="flex gap-1 mt-3 mb-4">
              {CHANNELS.map((ch) => (
                <button
                  key={ch}
                  onClick={() => setActiveTab(ch)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                    activeTab === ch
                      ? sentAt[ch] ? "bg-emerald-600 text-white" : "bg-teal-600 text-white"
                      : sentAt[ch] ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {sentAt[ch] ? `✓ ${TAB_LABELS[ch]}送信済み` : TAB_LABELS[ch]}
                </button>
              ))}
            </div>

            {renderedSubject !== null && (
              <p className="text-xs text-gray-500 mb-2">件名: <span className="text-gray-700 font-bold">{renderedSubject}</span></p>
            )}

            <textarea
              value={activeBody}
              onChange={(e) => setBodies(prev => prev ? { ...prev, [activeTab]: e.target.value } : prev)}
              rows={8}
              className="w-full text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 whitespace-pre-wrap leading-relaxed mb-2 font-sans focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
            />

            {unresolved.length > 0 && (
              <p className="text-xs text-red-600 mb-3">⚠ 未置換のプレースホルダーがあります（{unresolved.join(", ")}）。コピー・送信前に内容をご確認ください。</p>
            )}

            {activeTab === "line" && (
              <p className="text-xs text-gray-400 mb-3">送信元は、この端末でログイン中のLINEアカウントです。</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  copyTemplate(copyText);
                  if (activeTab !== "line") setConfirmChannel(activeTab);
                }}
                disabled={unresolved.length > 0}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {copiedTpl ? "コピーしました ✓" : `${TAB_LABELS[activeTab]}文面をコピー`}
              </button>
              {activeTab === "line" && (
                <button
                  onClick={() => {
                    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(bodies.line)}`, "_blank");
                    setConfirmChannel("line");
                  }}
                  disabled={unresolved.length > 0}
                  className="flex-1 py-2.5 rounded-xl bg-[#06C755] text-white text-sm font-bold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sentAt.line ? "もう一度LINEで送る" : "LINEで送る"}
                </button>
              )}
            </div>
          </div>

          <button
            onClick={() => {
              setConfirmUrl(null);
              setBodies(null);
              setForm(EMPTY_FORM);
              setSearchQuery("");
              setSelectedPatient(null);
              setPatients([]);
              setSearchDone(false);
              setApptToken(null);
              setSentAt({ sms: null, line: null, email: null });
              setConfirmChannel(null);
              setToast(null);
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

          {/* MVP+1: 診療区分（キャンセル料ポリシー適用判定に使う） */}
          <div>
            <label className="block text-sm font-bold mb-1.5 text-gray-700">診療区分</label>
            <div className="flex gap-2">
              {(["private", "insurance", "other"] as const).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTreatmentCategory(c)}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition ${treatmentCategory === c ? "bg-teal-600 border-teal-600 text-white font-bold" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  {TREATMENT_CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>

            {cancelPolicySettings?.enabled && (
              <div className="mt-2 text-sm">
                {cancelPolicyApplied ? (
                  <p className="text-teal-700">
                    キャンセルポリシーが適用されます
                    {activeCancelPolicy && (
                      <button type="button" onClick={() => setCancelPolicyPreviewOpen(o => !o)} className="ml-2 underline underline-offset-2 hover:text-teal-800">
                        {cancelPolicyPreviewOpen ? "本文を閉じる" : "本文を確認"}
                      </button>
                    )}
                    <button type="button" onClick={() => setCancelPolicyManualOverride(false)} className="ml-2 text-gray-400 underline underline-offset-2 hover:text-gray-600">
                      この予約では適用しない
                    </button>
                  </p>
                ) : (
                  <p className="text-gray-400">
                    キャンセルポリシーは適用されません
                    {activeCancelPolicy && (
                      <button type="button" onClick={() => setCancelPolicyManualOverride(true)} className="ml-2 text-teal-600 underline underline-offset-2 hover:text-teal-700">
                        この予約では適用する
                      </button>
                    )}
                  </p>
                )}
                {cancelPolicyPreviewOpen && activeCancelPolicy && (
                  <p className="mt-1.5 text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
                    {activeCancelPolicy.policyText}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* MVP+2: カード登録 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
              <input
                type="checkbox"
                checked={cardRegistrationRequired}
                onChange={e => setCardRegistrationRequired(e.target.checked)}
                className="h-4 w-4 accent-teal-600"
              />
              カード登録を求める
            </label>
            {cardRegistrationRequired && (
              <div className="mt-2">
                <label className="block text-sm font-bold mb-1.5 text-gray-700">
                  基準額（円）<span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  required={cardRegistrationRequired}
                  placeholder="例：10000"
                  value={baseAmount}
                  onChange={e => setBaseAmount(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-teal-500 transition text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">キャンセル発生時、段階テーブルの%をこの額に掛けて請求します</p>
              </div>
            )}
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
