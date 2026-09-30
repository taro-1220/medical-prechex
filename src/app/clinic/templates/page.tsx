"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAccessToken, getCurrentClinic, redirectToLogin } from "@/lib/clinic-auth";
import { resolveClinicGuard } from "@/lib/clinic-guard";
import { DEFAULT_TEMPLATES, PLACEHOLDER_KEYS, renderTemplate, findUnresolvedPlaceholders } from "@/lib/message-templates";
import type { MessageChannel, TemplateWithMeta } from "@/lib/types";

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";

const TAB_LABELS: Record<MessageChannel, string> = { sms: "SMS", line: "LINE", email: "メール" };
const CHANNELS: MessageChannel[] = ["sms", "line", "email"];

const SOURCE_LABEL: Record<TemplateWithMeta["source"], string> = {
  custom: "医院独自の文面を保存済み",
  legacy_default_message: "旧「予約確認メッセージ」設定を引き継いでいます（LINE）",
  default: "初期文のままです",
};

const PREVIEW_VARS = { patientName: "山田 太郎", clinicName: "medipre歯科クリニック", confirmUrl: "https://www.medipre.jp/confirm/xxxxxxxx" };

type Draft = { subject: string | null; body: string };

export default function ClinicTemplatesPage() {
  const router = useRouter();
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [metas, setMetas] = useState<Record<MessageChannel, TemplateWithMeta> | null>(null);
  const [drafts, setDrafts] = useState<Record<MessageChannel, Draft> | null>(null);
  const [activeTab, setActiveTab] = useState<MessageChannel>("line");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      const clinic = token ? await getCurrentClinic() : null;
      const guard = resolveClinicGuard(token, clinic);
      if (guard === "login") { redirectToLogin(router); return; }
      if (guard === "no-clinic" || !clinic) { router.replace("/clinic"); return; }
      setClinicId(clinic.id);
      const res = await fetch(`/api/clinic/templates?clinic_id=${clinic.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) { setLoadError(true); setLoading(false); return; }
      const { templates }: { templates: TemplateWithMeta[] } = await res.json();
      const metaMap = Object.fromEntries(templates.map(t => [t.channel, t])) as Record<MessageChannel, TemplateWithMeta>;
      setMetas(metaMap);
      setDrafts(Object.fromEntries(templates.map(t => [t.channel, { subject: t.subject, body: t.body }])) as Record<MessageChannel, Draft>);
      setLoading(false);
    })().catch(() => { setLoadError(true); setLoading(false); });
  }, [router]);

  const updateDraft = (channel: MessageChannel, patch: Partial<Draft>) => {
    setDrafts(prev => prev ? { ...prev, [channel]: { ...prev[channel], ...patch } } : prev);
    setSaveResult(null);
  };

  const resetToDefault = (channel: MessageChannel) => {
    // 編集欄への復元のみ。保存はしない（保存操作で確定する）
    updateDraft(channel, { subject: DEFAULT_TEMPLATES[channel].subject, body: DEFAULT_TEMPLATES[channel].body });
  };

  const save = async (channel: MessageChannel) => {
    if (!clinicId || !drafts) return;
    setSaving(true);
    setSaveResult(null);
    const token = await getAccessToken();
    const res = await fetch("/api/clinic/templates", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ clinicId, channel, subject: drafts[channel].subject, body: drafts[channel].body }),
    });
    if (res.ok) {
      setSaveResult("success");
      setMetas(prev => prev ? { ...prev, [channel]: { ...prev[channel], source: "custom", body: drafts[channel].body, subject: drafts[channel].subject } } : prev);
    } else {
      setSaveResult("error");
    }
    setSaving(false);
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-sm text-gray-500">読み込みに失敗しました</p>
        </div>
      </div>
    );
  }

  if (loading || !drafts || !metas) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  const draft = drafts[activeTab];
  const meta = metas[activeTab];
  const rendered = renderTemplate(draft.body, PREVIEW_VARS);
  const unresolved = findUnresolvedPlaceholders(rendered);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center gap-4">
        <Link href="/clinic" className="text-gray-400 text-sm hover:text-gray-900 transition">← 予約一覧</Link>
        <h1 className="text-xl font-black text-gray-900">送信用テンプレート</h1>
      </header>

      <div className="max-w-lg mx-auto px-6 py-6 space-y-4">
        <div className="flex gap-1">
          {CHANNELS.map((ch) => (
            <button
              key={ch}
              onClick={() => { setActiveTab(ch); setSaveResult(null); }}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${activeTab === ch ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
            >
              {TAB_LABELS[ch]}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">{TAB_LABELS[activeTab]}テンプレート</p>
            <span className="text-xs text-gray-400 border border-gray-200 rounded-full px-2.5 py-0.5">{SOURCE_LABEL[meta.source]}</span>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1.5">使えるプレースホルダー</p>
            <div className="flex flex-wrap gap-1.5">
              {PLACEHOLDER_KEYS.map((k) => (
                <code key={k} className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-1">{`{{${k}}}`}</code>
              ))}
            </div>
          </div>

          {activeTab === "email" && (
            <div>
              <label className="block text-sm font-bold mb-1.5 text-gray-700">件名</label>
              <input
                type="text"
                className={inputCls}
                value={draft.subject ?? ""}
                onChange={(e) => updateDraft(activeTab, { subject: e.target.value })}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-bold mb-1.5 text-gray-700">本文</label>
            <textarea
              className={`${inputCls} min-h-[160px] resize-y`}
              value={draft.body}
              onChange={(e) => updateDraft(activeTab, { body: e.target.value })}
            />
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1.5">プレビュー（サンプル値で置換）</p>
            <pre className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 whitespace-pre-wrap break-all leading-relaxed font-sans">{rendered}</pre>
            {unresolved.length > 0 && (
              <p className="text-xs text-red-600 mt-2">⚠ 未置換のプレースホルダーがあります: {unresolved.join(", ")}</p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => save(activeTab)}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 transition disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存"}
            </button>
            <button
              type="button"
              onClick={() => resetToDefault(activeTab)}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition"
            >
              初期文に戻す
            </button>
          </div>

          {saveResult === "success" && <p className="text-xs text-teal-600 font-bold">✓ 保存しました</p>}
          {saveResult === "error" && <p className="text-xs text-red-600 font-bold">保存に失敗しました。再度お試しください</p>}
          <p className="text-xs text-gray-400">「初期文に戻す」は編集欄を初期文に戻すだけです。保存を押すまで確定しません。</p>
        </div>
      </div>
    </div>
  );
}
